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

from jeepney.io.blocking import open_dbus_connection

from system.jeepney_wrappers import UnitProperties


def jeepney_get_service_property(
    service: str, property_name: str, iface_name: str = "Service", bus: str = "SESSION"
):
    # Instantiate the object
    obj = UnitProperties(service=service)
    # Connect to the bus and send the message, collecting the reply
    connection = open_dbus_connection(bus=bus)  # could also be 'SYSTEM'
    reply = connection.send_and_get_reply(
        obj.Get(iface_name=iface_name, property_name=property_name)
    )
    return reply.body[0][1]
