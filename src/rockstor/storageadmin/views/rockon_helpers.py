"""
Copyright (c) 2012-2020 RockStor, Inc. <http://rockstor.com>
This file is part of RockStor.

RockStor is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published
by the Free Software Foundation; either version 2 of the License,
or (at your option) any later version.

RockStor is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
"""

import logging
import os
import time

from django.conf import settings
from django_ztask.decorators import task

from cli.api_wrapper import APIWrapper
from storageadmin.models import (RockOn, DContainer, DVolume, DPort,
                                 DCustomConfig, DContainerLink,
                                 ContainerOption, DContainerEnv,
                                 DContainerDevice, DContainerArgs,
                                 DContainerLabel, DContainerNetwork)
from system.docker import dnet_create, dnet_connect
from system.osi import run_command
from fs.btrfs import mount_share
from rockon_utils import container_status

DOCKER = '/usr/bin/docker'
ROCKON_URL = 'https://localhost/api/rockons'
DCMD = [DOCKER, 'run', ]
DCMD2 = list(DCMD) + ['-d', '--restart=unless-stopped', ]
DNET = [DOCKER, 'network', ]

logger = logging.getLogger(__name__)
aw = APIWrapper()


def rockon_status(name):
    ro = RockOn.objects.get(name=name)
    if globals().get("%s_status" % ro.name.lower()) is not None:
        return globals().get("%s_status" % ro.name.lower())(ro)
    co = DContainer.objects.filter(rockon=ro).order_by("-launch_order")[0]
    return container_status(co.name)


def rm_container(name):
    o, e, rc = run_command([DOCKER, "stop", name], throw=False, log=True)
    o, e, rc = run_command([DOCKER, "rm", name], throw=False, log=True)
    return logger.debug(
        ("Attempted to remove a container ({}). Out: {} Err: {} rc: {}.").format(
            name, o, e, rc
        )
    )


@task()
def start(rid):
    logger.debug('the rockon {} was triggered for start'.format(rid))
    rockon = RockOn.objects.get(id=rid)
    logger.debug('the rockon is {}'.format(rockon.name))
    globals().get('%s_start' % rockon.name.lower(), generic_start)(rockon)


def generic_start(rockon):
    new_status = "started"
    try:
        for c in DContainer.objects.filter(rockon=rockon).order_by("launch_order"):
            run_command([DOCKER, "start", c.name], log=True)
    except Exception as e:
        logger.error(("Exception while starting the rockon ({}).").format(rockon.name))
        logger.exception(e)
        new_status = "start_failed"
    finally:
        url = "rockons/%d/status_update" % rockon.id
        return aw.api_call(
            url, data={"new_status": new_status,}, calltype="post", save_error=False
        )


@task()
def stop(rid):
    rockon = RockOn.objects.get(id=rid)
    globals().get("%s_stop" % rockon.name.lower(), generic_stop)(rockon)


def generic_stop(rockon):
    new_status = "stopped"
    try:
        for c in DContainer.objects.filter(rockon=rockon).order_by("-launch_order"):
            run_command([DOCKER, "stop", c.name], log=True)
    except Exception as e:
        logger.debug(("Exception while stopping the rockon ({}).").format(rockon.name))
        logger.exception(e)
        new_status = "stop_failed"
    finally:
        url = "rockons/%d/status_update" % rockon.id
        return aw.api_call(
            url, data={"new_status": new_status,}, calltype="post", save_error=False
        )


@task()
def update(rid, live=False):
    logger.debug('LIVE-update is set as {}'.format(live))
    if live:
        logger.debug('A live-update will be attempted.')
        new_state = 'installed'
        try:
            rockon = RockOn.objects.get(id=rid)
            logger.debug('rid is {} and rockon is {}'.format(rid, rockon))
            start(rid)
            dnet_create_connect(rockon)
        except Exception as e:
            logger.debug('Exception while live-updating the rock-on ({})'.format(rockon))
            logger.exception(e)
            new_state = 'install_failed'
        finally:
            url = ('rockons/{}/state_update'.format(rid))
            logger.debug('Update rockon ({}) STATE to: {} ({})'.format(rockon.name, new_state, url))
            return aw.api_call(url, data={'new_state': new_state, },
                               calltype='post', save_error=False)
    else:
        logger.debug('NORMAL-update of the rockonas {}'.format(live))
        uninstall(rid, new_state='pending_update')
        install(rid)


@task()
def install(rid):
    new_state = "installed"
    try:
        rockon = RockOn.objects.get(id=rid)
        globals().get("%s_install" % rockon.name.lower(), generic_install)(rockon)
    except Exception as e:
        logger.debug("Exception while installing the Rockon ({}).".format(rid))
        logger.exception(e)
        new_state = "install_failed"
    finally:
        logger.debug("Set rock-on {} state to {}".format(rid, new_state))
        url = "rockons/%d/state_update" % rid
        return aw.api_call(
            url, data={"new_state": new_state,}, calltype="post", save_error=False
        )


@task()
def uninstall(rid, new_state="available"):
    try:
        rockon = RockOn.objects.get(id=rid)
        globals().get("%s_uninstall" % rockon.name.lower(), generic_uninstall)(rockon)
    except Exception as e:
        logger.debug(("Exception while uninstalling the rockon ({}).").format(rid))
        logger.exception(e)
        new_state = "installed"
    finally:
        url = "rockons/%d/state_update" % rid
        return aw.api_call(
            url, data={"new_state": new_state,}, calltype="post", save_error=False
        )


def generic_uninstall(rockon):
    for c in DContainer.objects.filter(rockon=rockon):
        rm_container(c.name)


def container_ops(container):
    ops_list = []
    for o in ContainerOption.objects.filter(container=container):
        ops_list.append(o.name)
        if len(o.val.strip()) > 0:
            ops_list.append(o.val)
    return ops_list


def port_ops(container):
    ops_list = []
    for po in DPort.objects.filter(container=container):
        logger.debug('Test if port {} ({}) should be published'.format(po.id, po.description))
        # @todo: Skip po if export = false
        if (po.publish is not True):
            logger.debug('The port {} ({}) should not be published ({}), so skip it!'. format(po.id, po.description, po.publish))
            continue
        pstr = '{}:{}'.format(po.hostp, po.containerp)
        if (po.protocol is not None):
            pstr = '{}/{}'.format(pstr, po.protocol)
            ops_list.extend(['-p', pstr])
        else:
            tcp = '{}/tcp'.format(pstr)
            udp = '{}/udp'.format(pstr)
            ops_list.extend(['-p', tcp, '-p', udp, ])
    return ops_list


def vol_ops(container):
    ops_list = []
    for v in DVolume.objects.filter(container=container):
        share_mnt = "%s%s" % (settings.MNT_PT, v.share.name)
        mount_share(v.share, share_mnt)
        ops_list.extend(["-v", "%s:%s" % (share_mnt, v.dest_dir)])
    # map /etc/localtime for consistency across base rockstor and apps.
    ops_list.extend(["-v", "/etc/localtime:/etc/localtime:ro"])
    return ops_list


def device_ops(container):
    device_list = []
    for d in DContainerDevice.objects.filter(container=container):
        # device_list.append(d.dev)
        if len(d.val.strip()) > 0:
            device_list.extend(["--device", "%s" % (d.val)])
    return device_list


def vol_owner_uid(container):
    # If there are volumes, return the uid of the owner of the first volume.
    vo = DVolume.objects.filter(container=container).first()
    if vo is None:
        return None
    share_mnt = "%s%s" % (settings.MNT_PT, vo.share.name)
    return os.stat(share_mnt).st_uid


def cargs(container):
    cargs_list = []
    for c in DContainerArgs.objects.filter(container=container):
        cargs_list.append(c.name)
        if len(c.val.strip()) > 0:
            cargs_list.append(c.val)
    return cargs_list


def envars(container):
    var_list = []
    for e in DContainerEnv.objects.filter(container=container):
        var_list.extend(["-e", "%s=%s" % (e.key, e.val)])
    return var_list


def labels_ops(container):
    labels_list = []
    for l in DContainerLabel.objects.filter(container=container):
        if len(l.val.strip()) > 0:
            labels_list.extend(['--label', '%s' % (l.val)])
    return labels_list


def dnet_remove(container=None, network=None):
    """
    This method uses the docker toolset to remove a user-defined network.
    In Rockstor, these can be created either by a container_links object in a
    rock-on definition, or by the user. We thus need to account for both cases.
    :param container: DContainer object
    :param network: string of network name as seen by `docker network ls`
    :return:
    """
    if container:
        for lo in DContainerLink.objects.filter(destination=container):
            o, e, rc = run_command(list(DNET) + ['list', '--format', '{{.Name}}', ])
            logger.debug('the network name is: {}'.format(lo.name))
            if (lo.name in o):
                logger.debug('the network {} WAS detected, so delete it now.'.format(lo.name))
                run_command(list(DNET) + ['rm', lo.name, ])
                logger.debug('the network {} is now deleted.'.format(lo.name))
            else:
                logger.debug('the network {} was NOT detected, so nothing to do.'.format(lo.name))
    elif network:
        run_command(list(DNET) + ['rm', network, ])


def dnet_create_connect(rockon):
    for c in DContainer.objects.filter(rockon=rockon).order_by('launch_order'):
        logger.debug('The container name is {}'.format(c.name))
        if DContainerLink.objects.filter(destination=c):
            for lo in DContainerLink.objects.filter(destination=c):
                logger.debug('The lo.id is {}, lo.name is {}, lo.source_id is {}, and lo.destination_id is {}'.format(
                    lo.id, lo.name, lo.source_id, lo.destination_id))
                dnet_create(lo.name)
                # Connect containers
                logger.debug('Start CONNECTING containers')
                dnet_connect(lo.destination.name, lo.name)
                dnet_connect(lo.source.name, lo.name)
        if DContainerNetwork.objects.filter(container=c):
            logger.debug('Create and Connect container {}'.format(c.name))
            for cno in DContainerNetwork.objects.filter(container=c):
                dnet_create(cno.connection.docker_name)
                dnet_connect(container=cno.container.name, network=cno.connection.docker_name)
    # @todo: add detection of (or wait for) finished installed before creating networks?


def generic_install(rockon):
    for c in DContainer.objects.filter(rockon=rockon).order_by('launch_order'):
        rm_container(c.name)
        # pull image explicitly so we get updates on re-installs.
        image_name_plus_tag = c.dimage.name + ":" + c.dimage.tag
        run_command([DOCKER, "pull", image_name_plus_tag], log=True)
        cmd = list(DCMD2) + [
            "--name",
            c.name,
        ]
        cmd.extend(vol_ops(c))
        # Add '--device' flag
        cmd.extend(device_ops(c))
        if c.uid is not None:
            uid = c.uid
            if c.uid is -1:
                uid = vol_owner_uid(c)
            # @todo: what if the uid does not exist? Create a user with
            # username=container-name?
            cmd.extend(["-u", str(uid)])
        cmd.extend(port_ops(c))
        cmd.extend(container_ops(c))
        cmd.extend(envars(c))
        cmd.extend(labels_ops(c))
        cmd.append(image_name_plus_tag)
        cmd.extend(cargs(c))
        run_command(cmd, log=True)
    ## Get to networks
    dnet_create_connect(rockon)


def openvpn_install(rockon):
    """
    Custom config for the openvpn Rock-on install.
    :param rockon:
    :return:
    """
    # volume container
    vol_co = DContainer.objects.get(rockon=rockon, launch_order=1)
    volc_cmd = list(DCMD) + [
        "--name",
        vol_co.name,
    ]
    volc_cmd.extend(container_ops(vol_co))
    image_name_plus_tag = vol_co.dimage.name + ":" + vol_co.dimage.tag
    volc_cmd.append(image_name_plus_tag)
    run_command(volc_cmd, log=True)
    # initialize vol container data
    cco = DCustomConfig.objects.get(rockon=rockon)
    oc = DContainer.objects.get(rockon=rockon, launch_order=2)
    dinit_cmd = list(DCMD) + [
        "--rm",
    ]
    dinit_cmd.extend(container_ops(oc))
    image_name_plus_tag = oc.dimage.name + ":" + oc.dimage.tag
    dinit_cmd.extend(
        [image_name_plus_tag, "ovpn_genconfig", "-u", "udp://%s" % cco.val,]
    )
    run_command(dinit_cmd, log=True)
    # start the server
    server_cmd = list(DCMD2) + [
        "--name",
        oc.name,
    ]
    server_cmd.extend(container_ops(oc))
    server_cmd.extend(port_ops(oc))
    server_cmd.append(oc.dimage.name)
    run_command(server_cmd, log=True)


def owncloud_install(rockon):
    """
    Custom config for the owncloud Rock-on install.
    :param rockon:
    :return:
    """
    for c in DContainer.objects.filter(rockon=rockon).order_by("launch_order"):
        rm_container(c.name)
        cmd = list(DCMD2) + [
            "--name",
            c.name,
        ]
        db_user = DCustomConfig.objects.get(rockon=rockon, key="db_user").val
        db_pw = DCustomConfig.objects.get(rockon=rockon, key="db_pw").val
        if c.dimage.name == "postgres":
            # change permissions on the db volume to 700
            vo = DVolume.objects.get(container=c)
            share_mnt = "%s%s" % (settings.MNT_PT, vo.share.name)
            run_command(["/usr/bin/chmod", "700", share_mnt])
            cmd.extend(
                [
                    "-e",
                    "POSTGRES_USER=%s" % db_user,
                    "-e",
                    "POSTGRES_PASSWORD=%s" % db_pw,
                ]
            )
        cmd.extend(port_ops(c))
        for lo in DContainerLink.objects.filter(destination=c):
            cmd.extend(["--link", "%s:%s" % (lo.source.name, lo.name)])
        cmd.extend(vol_ops(c))
        if c.name == "owncloud":
            cmd.extend(
                [
                    "-v",
                    "%s/rockstor.key:/etc/ssl/private/owncloud.key"
                    % settings.CERTDIR,  # noqa E501
                    "-v",
                    "%s/rockstor.cert:/etc/ssl/certs/owncloud.crt"
                    % settings.CERTDIR,  # noqa E501
                    "-e",
                    "HTTPS_ENABLED=true",
                ]
            )
            cmd.extend(
                ["-e", "DB_USER=%s" % db_user, "-e", "DB_PASS=%s" % db_pw,]
            )
        image_name_plus_tag = c.dimage.name + ":" + c.dimage.tag
        cmd.append(image_name_plus_tag)
        logger.debug("Docker cmd = ({}).".format(cmd))
        run_command(cmd)
        if c.dimage.name == "postgres":
            # make sure postgres is setup
            cur_wait = 0
            while True:
                o, e, rc = run_command(
                    [DOCKER, "exec", c.name, "psql", "-U", "postgres", "-c", "\l"],
                    throw=False,
                )
                if rc == 0:
                    break
                if cur_wait > 300:
                    logger.error(
                        "Waited too long (300 seconds) for "
                        "postgres to initialize for owncloud. "
                        "giving up."
                    )
                    break
                time.sleep(1)
                cur_wait += 1
