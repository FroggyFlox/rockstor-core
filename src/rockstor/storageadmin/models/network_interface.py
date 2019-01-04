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

import json
from django.db import models
import logging
logger = logging.getLogger(__name__)

# This is the key abstraction for network configuration that is user
# configurable in Rockstor.  user can add, delete or modify connections which
# results in CRUD ops on this model and also on other models linked to this
# one, such as NetworkInterface, EthernetConnection etc..
class NetworkConnection(models.Model):
    # Wired connection 1, Team-team0 etc..
    name = models.CharField(max_length=256, null=True)
    # uuid generated by NM
    uuid = models.CharField(max_length=256, unique=True)
    # active (== GENERAL.STATE: activated in nmcli), could also be activating
    # or blank(assumed inactive) -- subtle distinction compared to state of
    # NetworkInterface
    state = models.CharField(max_length=64, null=True)

    # whether or not to automatically connect when underlying resources are
    # available.
    autoconnect = models.BooleanField(default=True)

    # manual or dhcp
    ipv4_method = models.CharField(max_length=64, null=True)
    # comma separated strings of ip/nm_bits. typically just one ip/nm. eg:
    # 192.168.1.5/24
    ipv4_addresses = models.CharField(max_length=1024, null=True)
    # there can only be one ipv4 gateway. eg: 192.168.1.1
    ipv4_gw = models.CharField(max_length=64, null=True)
    # comma separated strings of one or more dns addresses. eg: "8.8.8.8
    # 8.8.4.4"
    ipv4_dns = models.CharField(max_length=256, null=True)
    # comma separated strings of one or more dns search domains. eg:
    # rockstor.com
    ipv4_dns_search = models.CharField(max_length=256, null=True)

    # not clear yet on ipv6 stuff.
    ipv6_method = models.CharField(max_length=1024, null=True)
    ipv6_addresses = models.CharField(max_length=1024, null=True)
    ipv6_gw = models.CharField(max_length=64, null=True)
    ipv6_dns = models.CharField(max_length=256, null=True)
    ipv6_dns_search = models.CharField(max_length=256, null=True)

    # slave connections have a master. eg: team
    master = models.ForeignKey("NetworkConnection", null=True)

    @property
    def ipaddr(self):
        if self.ipv4_addresses is None:
            return None
        return self.ipv4_addresses.split(",")[0].split("/")[0]

    @property
    def mtu(self):
        if self.ethernetconnection_set.count() > 0:
            eco = self.ethernetconnection_set.first()
            try:
                return int(eco.mtu)
            except ValueError:
                pass
        return 1500

    @property
    def ctype(self):
        if (self.ethernetconnection_set.count() > 0):
            return 'ethernet'
        if (self.teamconnection_set.count() > 0):
            return 'team'
        if (self.bondconnection_set.count() > 0):
            return 'bond'
        if (self.bridgeconnection_set.count() > 0):
            return 'bridge'
        return None

    @property
    def team_profile(self):
        profile = None
        try:
            tco = self.teamconnection_set.first()
            config_d = json.loads(tco.config)
            profile = config_d["runner"]["name"]
        except:
            pass
        finally:
            return profile

    @property
    def bond_profile(self):
        profile = None
        try:
            bco = self.bondconnection_set.first()
            config_d = json.loads(bco.config)
            profile = config_d["mode"]
        except:
            pass
        finally:
            return profile

    @property
    def docker_name(self):
        logger.debug('The property method docker_name has been triggered')
        dname = None
        if self.bridgeconnection_set.count() > 0:
            brco = self.bridgeconnection_set.first()
            dname = brco.docker_name
            logger.debug('dname is {}.'.format(dname))
        return dname

    # @property
    # def docker_net(self):
    #     dnet = None
    #     if self.bridgeconnection_set.count() > 0:
    #         brco = self.bridgeconnection_set.first()
    #         dname = brco.docker_name
    #         if dname is not None:
    #             dnet = True
    #         logger.debug('dname is {}, so dnet is set to {}.'.format(dname, dnet))
    #     return dnet
    #
    #
    class Meta:
        app_label = "storageadmin"


# network interfaces/devices are auto detected from the system via "nmcli d
# show" They are not "directly" user configurable. but their attributes are
# refreshed in two ways 1. when user configures a NetworkConnection and inturn
# NetworkInterface is changed, eg: state.  2. When changes at the system level
# are picked up.
class NetworkDevice(models.Model):
    # enp0s3, lo etc..
    name = models.CharField(max_length=256, unique=True)
    # ethernet, infiniband etc..
    dtype = models.CharField(max_length=100, null=True)
    mac = models.CharField(max_length=100, null=True)
    connection = models.ForeignKey(
        NetworkConnection, null=True, on_delete=models.SET_NULL
    )
    # active (== GENERAL.STATE: activated in nmcli), could also be activating
    # or blank(assumed inactive)
    state = models.CharField(max_length=64, null=True)
    mtu = models.CharField(max_length=64, null=True)

    @property
    def cname(self):
        if self.connection is None:
            return None
        return self.connection.name

    class Meta:
        app_label = "storageadmin"


# This is the most common of connection types that uses NetworkInterface of
# dtype=ethernet
class EthernetConnection(models.Model):
    connection = models.ForeignKey(NetworkConnection, null=True)
    mac = models.CharField(max_length=64, null=True)
    cloned_mac = models.CharField(max_length=64, null=True)
    mtu = models.CharField(max_length=64, null=True)

    class Meta:
        app_label = "storageadmin"


class TeamConnection(models.Model):
    connection = models.ForeignKey(NetworkConnection, null=True)
    # eg: Team1
    name = models.CharField(max_length=64, null=True)
    # json config.
    config = models.CharField(max_length=2048, null=True)

    class Meta:
        app_label = "storageadmin"


class BondConnection(models.Model):
    connection = models.ForeignKey(NetworkConnection, null=True)
    name = models.CharField(max_length=64, null=True)
    # at the NM level it's not json like in team config, but we could convert
    # it for consistency.
    config = models.CharField(max_length=2048, null=True)

    class Meta:
        app_label = "storageadmin"


class BridgeConnection(models.Model):
    connection = models.ForeignKey(NetworkConnection, null=True)
    docker_name = models.CharField(max_length=64, null=True)

    class Meta:
        app_label = 'storageadmin'
