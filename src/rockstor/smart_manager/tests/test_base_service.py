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
from unittest.mock import patch, call

from rest_framework import status
from rest_framework.test import APITestCase

from smart_manager.models import Service
from system.constants import SERVICES, SERVICES_CONFIG

"""
proposed fixture = "test_base_service.json"

This fixture (unlike src/rockstor/smart_manager/fixtures/services.json)
includes a custom configuration set for several of the configurable services

cd /opt/rockstor
export DJANGO_SETTINGS_MODULE="settings"
poetry run django-admin dumpdata --database smart_manager smart_manager.service smart_manager.servicestatus \
--natural-foreign --indent 4 > \
src/rockstor/smart_manager/fixtures/test_base_service.json

To run the tests:
cd /opt/rockstor/src/rockstor
export DJANGO_SETTINGS_MODULE="settings"
poetry run django-admin test -v 2 -p test_base_service.py
"""


class BaseServiceTests(APITestCase):
    databases = "__all__"
    fixtures = ["test_api.json", "test_base_service.json"]
    BASE_URL = "/api/sm/services"

    def session_login(self):
        self.client.login(username="admin", password="admin")

    def test_get(self):
        # get service with valid service names
        self.session_login()
        for service in SERVICES:
            response = self.client.get(f"{self.BASE_URL}/{SERVICES[service]}")
            self.assertEqual(response.status_code, status.HTTP_200_OK, msg=response)

    def test_put(self):
        """test reset config to defaults"""
        # mock run_command()
        self.patch_systemctl = patch("smart_manager.views.base_service.systemctl")
        self.mock_systemctl = self.patch_systemctl.start()
        self.mock_systemctl.return_value = [""], [""], 0
        # mock aw.api_call()
        self.patch_api_call = patch(
            "smart_manager.views.base_service.APIWrapper.api_call"
        )
        self.mock_api_call = self.patch_api_call.start()
        self.mock_api_call.return_value = {}

        self.session_login()
        calls = []
        for service in SERVICES:
            service_name = SERVICES[service]
            expected_config = None
            if service_name in SERVICES_CONFIG:
                expected_config = SERVICES_CONFIG[service_name]
            response = self.client.put(f"{self.BASE_URL}/{service_name}")
            self.assertEqual(response.status_code, status.HTTP_200_OK, msg=response)
            if service_name == "rockstor":
                # the API POST call for rockstor differs from other services
                data = {"config": {"network_interface": "", "listener_port": 443}}
                headers = {
                    "content-type": "application/json",
                }
                calls.append(
                    call(
                        f"sm/services/{service_name}/config",
                        data=data,
                        calltype="post",
                        headers=headers,
                        save_error=False,
                    )
                )
            else:
                calls.append(
                    call(
                        f"sm/services/{service_name}/stop",
                        data=None,
                        calltype="post",
                        save_error=False,
                    )
                )
            # Verify config is back to defaults
            test_so = Service.objects.get(name=service_name)
            returned_config = test_so.config
            self.assertEqual(
                returned_config,
                expected_config,
                msg="Un-expected config found:\n "
                f"returned = {returned_config}.\n "
                f"expected = {expected_config}.",
            )
        # Verify the api_call to stop services was sent as expected
        self.mock_api_call.assert_has_calls(calls, any_order=False)
