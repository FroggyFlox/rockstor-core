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

from smart_manager.models import Service
from storageadmin.models import Setup
from system.constants import SERVICES, SERVICES_CONFIG


def register_services() -> None:
    """Ensures Service model is properly instantiated
    This function loops through a list of services used as a reference
    for how the Service model should be populated.
    If a service listed is not present in the model, create it.
    """
    for k, v in SERVICES.items():
        try:
            so = Service.objects.get(name=v)
            so.display_name = k
            # Apply any configuration defaults found in services_configs.
            if v in SERVICES_CONFIG:
                so.config = SERVICES_CONFIG[v]
        except Service.DoesNotExist:
            so = Service(display_name=k, name=v)
        finally:
            so.save()
    for so in Service.objects.filter():
        if so.display_name not in SERVICES:
            so.delete()


def create_setup():
    setup = Setup.objects.all()
    if len(setup) == 0:
        s = Setup()
        s.save()


def main():
    create_setup()
    register_services()
