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

from osi import append_to_line
from tempfile import mkstemp
from shutil import move
import logging

logger = logging.getLogger(__name__)

NSSWITCH_FILE = "/etc/nsswitch.conf"


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
