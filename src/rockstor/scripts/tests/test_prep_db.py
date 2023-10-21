"""
Copyright (c) 2012-2023 RockStor, Inc. <https://rockstor.com>
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
along with this program. If not, see <https://www.gnu.org/licenses/>.
"""
from django.test import TestCase

from scripts.prep_db import register_services
from smart_manager.models import Service
from system.constants import SERVICES, SERVICES_CONFIG

"""
prep_db.py expects an empty Service model so no need for fixtures here.

To run the tests:
cd /opt/rockstor/src/rockstor
export DJANGO_SETTINGS_MODULE="settings"
poetry run django-admin test -v 2 -p test_prep_db.py
"""


class PrepDbTests(TestCase):
    databases = "__all__"

    def setUp(self):
        register_services()
        # For now, we need to run register_services twice
        # (because in real installs, smartdb.sql.in sets the config item as well)
        # This may be a bug as prep_db.register_services should take care of it
        # (shortcoming in code line 61?)
        register_services()

    def test_services_created(self):
        """ensure all entries in Service model are as expected"""
        for k, v in SERVICES.items():
            test_so = Service.objects.get(name=v)
            returned_display_name = test_so.display_name
            self.assertEqual(
                returned_display_name,
                k,
                msg="Un-expected display_name found:\n "
                f"returned = {returned_display_name}.\n "
                f"expected = {k}.",
            )
            expected_config = None
            if v in SERVICES_CONFIG:
                expected_config = SERVICES_CONFIG[v]
            returned_config = test_so.config
            self.assertEqual(
                returned_config,
                expected_config,
                msg="Un-expected extract_param() result:\n "
                f"returned = {returned_config}.\n "
                f"expected = {expected_config}.",
            )
