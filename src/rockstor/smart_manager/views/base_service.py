"""
Copyright (joint work) 2024 The Rockstor Project <https://rockstor.com>

Rockstor is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published
by the Free Software Foundation; either version 2 of the License,
or (at your option) any later version.

Rockstor is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
"""

from smart_manager.models import Service, ServiceStatus
from django.conf import settings
from smart_manager.serializers import ServiceStatusSerializer
import json
import rest_framework_custom as rfc
from cli.api_wrapper import APIWrapper
from rest_framework.response import Response

from system.constants import SERVICES_CONFIG
from system.services import service_status, systemctl
from django.db import transaction
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class ServiceMixin(object):
    def _save_config(self, service, config):
        if config is not None:
            service.config = json.dumps(config)
        else:
            service.config = None
        return service.save()

    def _get_config(self, service):
        return json.loads(service.config)

    def _get_or_create_sso(self, service):
        ts = datetime.utcnow().replace(tzinfo=timezone.utc)
        so = None
        if ServiceStatus.objects.filter(service=service).exists():
            so = ServiceStatus.objects.filter(service=service).order_by("-ts")[0]
        else:
            so = ServiceStatus(service=service, count=0)
        so.status = self._get_status(service)
        so.count += 1
        so.ts = ts
        so.save()
        return so

    def _get_status(self, service):
        try:
            config = None
            if service.config is not None:
                config = self._get_config(service)

            o, e, rc = service_status(service.name, config)
            if rc == 0:
                return True
            return False
        except Exception as e:
            msg = f"Exception while querying status of service ({service.name}): {e.__str__()}"
            logger.error(msg)
            logger.exception(e)
            return False


class BaseServiceView(ServiceMixin, rfc.GenericView):
    serializer_class = ServiceStatusSerializer

    @transaction.atomic
    def get_queryset(self, *args, **kwargs):
        with self._handle_exception(self.request):
            limit = self.request.query_params.get(
                "limit", settings.REST_FRAMEWORK["MAX_LIMIT"]
            )
            limit = int(limit)
            url_fields = self.request.path.strip("/").split("/")
            if len(url_fields) < 4:
                sos = []
                for s in Service.objects.all():
                    sos.append(self._get_or_create_sso(s))
                # https://docs.python.org/3.6/howto/sorting.html#key-functions
                return sorted(sos, key=lambda each: each.display_name)


class BaseServiceDetailView(ServiceMixin, rfc.GenericView):
    serializer_class = ServiceStatusSerializer

    @transaction.atomic
    def get(self, request, *args, **kwargs):
        with self._handle_exception(self.request, msg=None):
            url_fields = self.request.path.strip("/").split("/")
            s = Service.objects.get(name=url_fields[3])
            self.paginate_by = 0
            serialized_data = ServiceStatusSerializer(self._get_or_create_sso(s))
            return Response(serialized_data.data)

    def put(self, request):
        """Used to reset a Service config to its defaults"""
        with self._handle_exception(self.request, msg=None):
            url_fields = self.request.path.strip("/").split("/")
            service_name = url_fields[3]
            s = Service.objects.get(name=service_name)

            # First, stop the Service
            if service_name == "rockstor":
                # For the Rockstor service, we cannot STOP it
                # Instead, we need to run the 'config' command
                # with what should be defaults settings
                # This will save these 'data' to the instance's config field
                # but we'll set it back to 'null' at then of this PUT here.
                data = {
                    "config": {
                        "network_interface": "",
                        "listener_port": 443
                    }
                }
                aw = APIWrapper()
                url = f"sm/services/{service_name}/config"
                headers = {
                    "content-type": "application/json",
                }
                aw.api_call(url, data=data, calltype="post", headers=headers, save_error=False)
                logger.debug(f"sent POST to {url}")
            else:
                aw = APIWrapper()
                url = f"sm/services/{service_name}/stop"
                aw.api_call(url, data=None, calltype="post", save_error=False)
                logger.debug(f"sent POST to {url}")
            # The tailscaled service requires an additional step
            if service_name == "tailscaled":
                systemctl(service_name, "stop")
                systemctl(service_name, "disable")

            # Then, set config to default_config
            default_config = None
            # Some services have a non-null default config
            # services_configs = {
            #     "shellinaboxd": (
            #         '{"detach": false, "css": "white-on-black", "shelltype": "LOGIN"}'
            #     )
            # }
            if service_name in SERVICES_CONFIG:
                default_config = SERVICES_CONFIG[service_name]
            logger.debug(f"Reset config of {service_name} to {default_config}")
            s.config = default_config
            s.save()

            serialized_data = ServiceStatusSerializer(self._get_or_create_sso(s))
            return Response(serialized_data.data)
