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

import os
import stat

import re

from osi import append_to_line, run_command
from tempfile import mkstemp
from shutil import move
import logging

from system.services import systemctl

logger = logging.getLogger(__name__)

NSSWITCH_FILE = "/etc/nsswitch.conf"
SSSD_FILE = "/etc/sssd/sssd.conf"
NET = "/usr/bin/net"
REALM = "/usr/sbin/realm"
ADCLI = "/usr/sbin/adcli"


def update_nss(databases, provider, remove=False):
    """
    Update the nss configuration file (NSSWITCH_FILE) to include a
    given provider ("sss", for instance) to one or more databases.
    :param databases: List - databases to be updated (e.g. ["passwd", "group"])
    :param provider: String - provider to be used (e.g. "sss")
    :param remove: Boolean - Remove provider from databases if True
    :return:
    """
    fo, npath = mkstemp()
    # databases = ["passwd", "group"]
    dbs = [db + ":" for db in databases]
    # provider = "sss"

    append_to_line(NSSWITCH_FILE, npath, dbs, provider, remove)
    move(npath, NSSWITCH_FILE)
    # Set file to rw- r-- r-- (644) via stat constants.
    os.chmod(NSSWITCH_FILE, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    logger.debug(
        "The {} provider to the {} databases has been updated in {}".format(
            provider, databases, NSSWITCH_FILE
        )
    )


def update_sssd(domain, config):
    """
    Add enumerate = True in sssd so user/group lists will be
    visible on the web-ui.
    :param domain: String - Domain to which the update should apply
    :param config: Dict - Active Directory service configuration
    :return:
    """
    el = "enumerate = True\n"
    csl = "case_sensitive = True\n"
    opts = []
    if config.get("enumerate") is True:
        opts.append(el)
    if config.get("case_sensitive") is True:
        opts.append(csl)
    ol = "".join(opts)
    logger.debug("ol is = {}".format(ol))
    fh, npath = mkstemp()
    # sssd_config = "/etc/sssd/sssd.conf"
    with open(SSSD_FILE) as sfo, open(npath, "w") as tfo:
        domain_section = False
        for line in sfo.readlines():
            if domain_section is True:
                if len(line.strip()) == 0 or line[0] == "[":
                    # empty line or new section without empty line before
                    # it.
                    tfo.write(ol)
                    domain_section = False
            elif re.match("\[domain/%s]" % domain, line) is not None:
                domain_section = True
            tfo.write(line)
        if domain_section is True:
            # reached end of file, also coinciding with end of domain
            # section
            tfo.write(ol)
    move(npath, SSSD_FILE)
    # Set file to rw- --- --- (600) via stat constants.
    os.chmod(SSSD_FILE, stat.S_IRUSR | stat.S_IWUSR)
    logger.debug(
        "The configuration of the {} domain in {} has been updated".format(
            domain, SSSD_FILE
        )
    )
    systemctl("sssd", "restart")


def join_domain(config, method="sssd"):
    """
    Join an Active Directory domain.
    :param config: Dict - gathered from the AD service config
    :param method: String - SSSD or Winbind (default is sssd)
    :return:
    """
    domain = config.get("domain")
    admin = config.get("username")
    cmd = [REALM, "join", "-U", admin, domain]
    cmd_options = ["--membership-software=samba", ]
    if config.get("no_ldap_id_mapping") is True:
        cmd_options.append("--automatic-id-mapping=no")
    cmd[-3:-3] = cmd_options
    if method == "winbind":
        cmd = [NET, "ads", "join", "-U", admin]
    return run_command(cmd, input=("{}\n".format(config.get("password"))), log=True)


def leave_domain(config, method="sssd"):
    """
    Leave a configured Active Directory domain.
    :param config: Dict - gathered from the AD service config
    :param method: String - SSSD or Winbind (default is sssd)
    :return:
    """
    pstr = "{}\n".format(config.get("password"))
    cmd = [REALM, "leave", config.get("domain")]
    if method == "winbind":
        cmd = [NET, "ads", "leave", "-U", config.get("username")]
        try:
            return run_command(cmd, input=pstr)
        except:
            status_cmd = [NET, "ads", "status", "-U", config.get("username")]
            o, e, rc = run_command(status_cmd, input=pstr, throw=False)
            if rc != 0:
                return logger.debug(
                    "Status shows not joined. out: %s err: %s rc: %d" % (o, e, rc)
                )
            raise
    else:
        run_command(cmd, log=True)


def domain_workgroup(domain=None, method="sssd"):
    """
    Fetches the Workgroup value from an Active Directory domain
    to be fed to Samba configuration.
    :param domain: String - Active Directory domain
    :param method: String - SSSD or Winbind (default is sssd)
    :return:
    """
    cmd = [NET, "ads", "workgroup", "-S", domain]
    if method == "winbind":
        cmd = [ADCLI, "info", domain]
    o, e, rc = run_command(cmd)
    match_str = "Workgroup:"
    if method == "winbind":
        match_str = "domain-short = "
    for l in o:
        l = l.strip()
        if re.match(match_str, l) is not None:
            return l.split(match_str)[1].strip()
    raise Exception(
        "Failed to retrieve Workgroup. out: {} err: {} rc: {}".format(o, e, rc)
    )
