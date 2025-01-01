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

from jeepney_wrappers import UnitProperties

# Instantiate the object
test = UnitProperties(service="smb")

# Connect to the SYSTEM bus and send the message, collecting the reply
connection = open_dbus_connection(bus='SYSTEM')  # could also be 'SESSION'
reply = connection.send_and_get_reply(test.Get(iface_name="Service", property_name="StatusText"))
