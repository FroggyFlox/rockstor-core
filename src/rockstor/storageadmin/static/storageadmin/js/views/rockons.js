/*
 *
 * @licstart  The following is the entire license notice for the
 * JavaScript code in this page.
 *
 * Copyright (c) 2012-2013 RockStor, Inc. <http://rockstor.com>
 * This file is part of RockStor.
 *
 * RockStor is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published
 * by the Free Software Foundation; either version 2 of the License,
 * or (at your option) any later version.
 *
 * RockStor is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * @licend  The above is the entire license notice
 * for the JavaScript code in this page.
 *
 */

RockonsView = RockstorLayoutView.extend({


    initialize: function() {
        this.constructor.__super__.initialize.apply(this, arguments);
        this.template = window.JST.rockons_rockons;
        this.rockons = new RockOnCollection({});
        this.rockons.pageSize = RockStorGlobals.maxPageSize;
        this.service = new Service({
            name: 'docker'
        });
        this.dependencies.push(this.rockons, this.service);
        this.updateFreq = 15000;
        this.defTab = 0;
        this.initHandlebarHelpers();
    },

    events: {
        'switchChange.bootstrapSwitch': 'rockonToggle',
        'click #js-install-rockon': 'installRockon',
        'click #js-uninstall-rockon': 'uninstallRockon',
        'click #js-rockons-installed': 'installedRockons',
        'click #js-update-rockons': 'updateRockons',
        'click #js-rockon-settings': 'rockonSettings',
        'click #js-rockon-info': 'rockonInfo'
    },

    render: function() {
        this.service.fetch();
        this.rockons.fetch();
        console.log('Print this at render = ', this);
        this.updateStatus();

        return this;
    },

    renderRockons: function() {
        var _this = this;

        var ui_map = {};
        var uis = this.rockons.filter(function(rockon) {
            ui_map[rockon.get('id')] = null;
            if (rockon.get('ui')) {
                var protocol = 'http://';
                if (rockon.get('https')) {
                    protocol = 'https://';
                }
                var ui_link = protocol + window.location.hostname;
                if (rockon.get('ui_port')) {
                    ui_link += ':' + rockon.get('ui_port');
                }
                if (rockon.get('link')) {
                    ui_link += '/' + rockon.get('link');
                }
                ui_map[rockon.get('id')] = ui_link;
            }
            return false;
        });
        $(this.el).html(this.template({
            rockons: _this.rockons,
            rockonJson: _this.rockons.toJSON(),
            status: _this.service.get('status'),
            ui_map: ui_map
        }));

        if (!this.dockerServiceView) {
            this.dockerServiceView = new DockerServiceView({
                parentView: _this
            });
        }
        // Render the Rockons template with a status describing whether
        // the Rockons service has been enabled

        $('#docker-service-ph').append(this.dockerServiceView.render().el);

        $('#install-rockon-overlay').overlay({
            load: false
        });
        this.$('ul.nav.nav-tabs').tabs('div.css-panes > div');
        this.$('.nav-tabs li:eq(' + this.defTab + ') a').click();

        //initalize bootstrap switch
        this.$('[type=\'checkbox\']').bootstrapSwitch();
        this.$('[type=\'checkbox\']').bootstrapSwitch('onColor', 'success'); //left side text color
        this.$('[type=\'checkbox\']').bootstrapSwitch('offColor', 'danger'); //right side text color
    },

    installRockon: function(event) {
        var _this = this;
        this.defTab = 0;
        event.preventDefault();
        var button = $(event.currentTarget);
        var rockon_id = button.attr('data-name');
        var rockon_o = _this.rockons.get(rockon_id);
        var wizardView = new RockonInstallWizardView({
            model: new Backbone.Model({
                rockon: rockon_o
            }),
            title: rockon_o.get('name') + ' install wizard',
            parent: this
        });
        $('.overlay-content', '#install-rockon-overlay').html(wizardView.render().el);
        $('#install-rockon-overlay').overlay().load();
    },

    uninstallRockon: function(event) {
        var _this = this;
        event.preventDefault();
        var button = $(event.currentTarget);
        if (buttonDisabled(button)) return false;
        var rockon_id = button.attr('data-name');
        var rockon_o = _this.rockons.get(rockon_id);
        if (confirm('Are you sure you want to uninstall this Rock-on (' + rockon_o.get('name') + ')?')) {
            disableButton(button);
            $.ajax({
                url: '/api/rockons/' + rockon_id + '/uninstall',
                type: 'POST',
                dataType: 'json',
                success: function() {
                    _this.defTab = 0;
                    _this.render();
                    enableButton(button);
                },
                error: function(xhr, status, error) {
                    enableButton(button);
                }
            });
        }
    },

    updateRockons: function(event) {
        var _this = this;
        event.preventDefault();
        var button = $(event.currentTarget);
        if (buttonDisabled(button)) return false;
        disableButton(button);
        $.ajax({
            url: '/api/rockons/update',
            type: 'POST',
            dataType: 'json',
            success: function() {
                _this.defTab = 1;
                _this.render();
                enableButton(button);
            },
            error: function(xhr, status, error) {
                enableButton(button);
            }
        });
    },

    rockonSettings: function(event) {
        var _this = this;
        event.preventDefault();
        var rockon_id = _this.getRockonId(event);
        var rockon_o = _this.rockons.get(rockon_id);
        _this.stopPolling();
        var wizardView = new RockonSettingsWizardView({
            model: new Backbone.Model({
                rockon: rockon_o
            }),
            title: rockon_o.get('name') + ' Settings',
            parent: this
        });
        $('.overlay-content', '#install-rockon-overlay').html(wizardView.render().el);
        $('#install-rockon-overlay').overlay().load();
    },

    rockonInfo: function(event) {
        var _this = this;
        event.preventDefault();
        var rockon_id = _this.getRockonId(event);
        var rockon_o = _this.rockons.get(rockon_id);
        _this.stopPolling();
        var infoView = new RockonInfoView({
            model: new Backbone.Model({
                rockon: rockon_o
            }),
            title: 'Additional information about ' + rockon_o.get('name') + ' Rock-on',
            parent: this
        });
        $('.overlay-content', '#install-rockon-overlay').html(infoView.render().el);
        $('#install-rockon-overlay').overlay().load();
    },

    getRockonId: function(event) {
        var slider = $(event.currentTarget);
        return slider.attr('data-rockon-id');
    },

    rockonToggle: function(event, state) {
        var rockonId = $(event.target).attr('data-rockon-id');
        if (state) {
            this.startRockon(rockonId);
        } else {
            this.stopRockon(rockonId);
        }
    },

    startRockon: function(rockonId) {
        var _this = this;
        this.stopPolling();
        $.ajax({
            url: '/api/rockons/' + rockonId + '/start',
            type: 'POST',
            dataType: 'json',
            success: function(data, status, xhr) {
                _this.defTab = 0;
                _this.updateStatus();
            },
            error: function(data, status, xhr) {
                console.log('error while starting rockon');
            }
        });
    },

    stopRockon: function(rockonId) {
        var _this = this;
        this.stopPolling();
        $.ajax({
            url: '/api/rockons/' + rockonId + '/stop',
            type: 'POST',
            dataType: 'json',
            success: function(data, status, xhr) {
                _this.defTab = 0;
                _this.updateStatus();
            },
            error: function(data, status, xhr) {
                console.log('error while stopping rockon');
            }
        });
    },

    pendingOps: function() {
        var pending = this.rockons.find(function(rockon) {
            if ((rockon.get('status').search('pending') != -1) || (rockon.get('state').search('pending') != -1)) {
                return true;
            }
        });
        if (pending) {
            return true;
        }
        return false;
    },

    updateStatus: function() {
        var _this = this;
        _this.startTime = new Date().getTime();
        _this.rockons.fetch({
            silent: true,
            success: function(data, response, options) {
                _this.renderRockons();
                if (_this.pendingOps()) {
                    var ct = new Date().getTime();
                    var diff = ct - _this.startTime;
                    if (diff > _this.updateFreq) {
                        _this.updateStatus();
                    } else {
                        _this.timeoutId = window.setTimeout(function() {
                            _this.updateStatus();
                        }, _this.updateFreq - diff);
                    }
                } else {
                    _this.stopPolling();
                }
            }
        });
    },

    stopPolling: function() {
        if (!_.isUndefined(this.timeoutId)) {
            window.clearInterval(this.timeoutId);
        }
    },

    installedRockons: function(event) {
        if (this.pendingOps()) {
            this.updateStatus();
        }
    },

    //@todo: cleanup after figuring out how to track the installed variable.
    initHandlebarHelpers: function() {
        Handlebars.registerHelper('display_installedRockons', function() {
            var html = '';
            _this = this;
            console.log('print this for ROCKON display', this);
            var installed = 0;
            this.rockons.each(function(rockon, index) {
                if (rockon.get('state') == 'installed' || rockon.get('state').match('pending')) {
                    installed += 1;
                    html += '<div id="js-rockons-installed" class="tab-section" style="position: relative">';
                    if (rockon.get('state').search('pending') > -1 || rockon.get('status').search('pending') > -1) {
                        var text = 'Installing ...';
                        if (rockon.get('state') == 'pending_uninstall') {
                            text = 'Uninstalling ...';
                        } else if (rockon.get('status') == 'pending_start') {
                            text = 'Starting ...';
                        } else if (rockon.get('status') == 'pending_stop') {
                            text = 'Stopping ...';
                        }
                        html += '<div class="overlay">';
                        html += '<div class="text-center">';
                        html += '<i class="fa fa-3x fa-cog fa-spin"></i>';
                        html += '<div>';
                        html += '<p class="lead">' + text + '</p>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }
                    html += '<div class="row">';
                    html += '<div class="col-md-6">';
                    html += '<a href="' + rockon.get('website') + '" target="_blank"><h3><u>' + rockon.get('name') + '</u></h3></a>';
                    html += '<p>' + rockon.get('description') + '</p>';
                    html += '<h4>Current status: ' + rockon.get('status') + '</h4>';
                    html += '</div>';
                    html += '<div class="col-md-3"></div>';
                    html += '<div class="col-md-3">';
                    if (rockon.get('state') == 'installed' && !rockon.get('status').match('pending')) {
                        if (rockon.get('status') == 'started') {
                            html += '<input type="checkbox" name="rockon-status-checkbox" data-rockon-id="' + rockon.get('id') + '" data-size="mini" checked />';
                        } else {
                            html += '<input type="checkbox" name="rockon-status-checkbox" data-rockon-id="' + rockon.get('id') + '" data-size="mini" />';
                        }
                        html += ' <a id="js-rockon-settings" href="#" class="settings" data-rockon-id="' + rockon.get('id') + '"><i class="glyphicon glyphicon-wrench"></i></a>&nbsp;&nbsp';
                        if (rockon.get('more_info')) {
                            html += '<a id="js-rockon-info" href="#" class="moreinfo" data-rockon-id="' + rockon.get('id') + '"><i class="fa fa-info-circle"></i></a>';
                        }
                        html += '<br><br>';
                        if (_this.ui_map[rockon.get('id')]) {
                            if (rockon.get('status') == 'started') {
                                if (rockon.get('ui_publish')) {
                                    html += '<a href="' + _this.ui_map[rockon.get('id')] + '" target="_blank" class="btn btn-primary">' + rockon.get('name') + ' UI</a> ';
                                } else {
                                    html += '<span title="Disabled due to current ports settings. See rock-on settings."><a href="#" class="btn btn-primary disabled">' + rockon.get('name') + ' UI</a></span> ';
                                }
                            } else {
                                html += '<span title="Switch on to access the UI."><a href="#" class="btn btn-primary disabled">' + rockon.get('name') + ' UI</a></span> ';
                            }
                        }
                        if (rockon.get('status') != 'started') {
                            html += '<a id="js-uninstall-rockon" class="btn btn-danger" data-name="' + rockon.get('id') + '">Uninstall</a>';
                        }

                    }
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                }
            });
            if (installed == 0) {
                html += '<div class="tab-section">';
                html += '<div class="row">';
                html += '<div class="col-md-12">';
                html += '<h3>There are no Rock-ons installed currently.</h3>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
            return new Handlebars.SafeString(html);
        });

        Handlebars.registerHelper('display_allRockons', function() {
            var html = '';
            var all = 0;
            this.rockons.each(function(rockon, index) {
                if (rockon.get('state') == 'available' || rockon.get('state') == 'install_failed') {
                    all += 1;
                    html += '<div class="tab-section">';
                    html += '<div class="row">';
                    html += '<div class="col-md-12">';
                    html += '<a href="' + rockon.get('website') + '" target="_blank"><h3>' + rockon.get('name') + '</h3></a>';
                    html += '<p>' + rockon.get('description') + '</p>';
                    if (rockon.get('state') == 'install_failed') {
                        html += '<strong>Failed to install in the previous attempt.</strong> Here\'s how you can proceed.';
                        html += '<ul>';
                        html += '<li>Check logs in /opt/rockstor/var/log for clues.</li>';
                        html += '<li>Install again.</li>';
                        html += '<li>If the problem persists, post on the <a href="http://forum.rockstor.com" target="_blank">Forum</a> or email support@rockstor.com</li>';
                        html += '</ul>';
                    }
                    html += '<a id="js-install-rockon" class="btn btn-primary pull-right" href="#" data-name="' + rockon.get('id') + '">Install</a>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                }
            });
            if (all == 0) {
                html += '<div class="tab-section">';
                html += '<div class="row">';
                html += '<div class="col-md-12">';
                html += '<h3>Click on Update button to check for new Rock-ons.</h3>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
            return new Handlebars.SafeString(html);
        });
    }

});


RockonInstallWizardView = WizardView.extend({
    initialize: function() {
        WizardView.prototype.initialize.apply(this, arguments);
        this.pages = [];
        this.rockon = this.model.get('rockon');
        this.volumes = new RockOnVolumeCollection(null, {
            rid: this.rockon.id
        });
        this.ports = new RockOnPortCollection(null, {
            rid: this.rockon.id
        });
        this.custom_config = new RockOnCustomConfigCollection(null, {
            rid: this.rockon.id
        });
        this.devices = new RockOnDeviceCollection(null, {
            rid: this.rockon.id
        });
        this.environment = new RockOnEnvironmentCollection(null, {
            rid: this.rockon.id
        });
    },

    fetchVolumes: function() {
        var _this = this;
        this.volumes.fetch({
            success: function() {
                _this.model.set('volumes', _this.volumes);
                _this.fetchPorts();
            }
        });
    },

    fetchPorts: function() {
        var _this = this;
        this.ports.fetch({
            success: function() {
                _this.model.set('ports', _this.ports);
                _this.fetchDevices();
            }
        });
    },

    fetchCustomConfig: function() {
        var _this = this;
        this.custom_config.fetch({
            success: function() {
                _this.model.set('custom_config', _this.custom_config);
                _this.fetchEnvironment();
            }
        });
    },

    fetchDevices: function() {
        var _this = this;
        this.devices.fetch({
            success: function() {
                _this.model.set('devices', _this.devices);
                _this.fetchCustomConfig();
            }
        });
    },

    fetchEnvironment: function() {
        var _this = this;
        this.environment.fetch({
            success: function() {
                _this.model.set('environment', _this.environment);
                _this.addPages();
            }
        });
    },

    render: function() {
        this.fetchVolumes();
        return this;
    },

    addPages: function() {
        if (this.volumes.length > 0) {
            this.pages.push(RockonShareChoice);
        }
        if (this.ports.length > 0) {
            this.pages.push(RockonPortChoice);
        }
        if (this.devices.length > 0) {
            this.pages.push(RockonDeviceChoice);
        }
        if (this.environment.length > 0) {
            this.pages.push(RockonEnvironment);
        }
        if (this.custom_config.length > 0) {
            this.pages.push(RockonCustomChoice);
        }
        this.pages.push.apply(this.pages, [RockonInstallSummary, RockonInstallComplete]);
        WizardView.prototype.render.apply(this, arguments);
        return this;
    },

    setCurrentPage: function() {
        this.currentPage = new this.pages[this.currentPageNum]({
            model: this.model,
            parent: this,
            evAgg: this.evAgg
        });
    },

    modifyButtonText: function() {
        if (this.currentPageNum == (this.pages.length - 2)) {
            this.$('#next-page').html('Submit');
        } else if (this.currentPageNum == (this.pages.length - 1)) {
            this.$('#prev-page').hide();
            this.$('#next-page').html('Close');
        } else if (this.currentPageNum == 0) {
            this.$('#prev-page').hide();
        } else {
            this.$('#prev-page').show();
            this.$('#next-page').html('Next');
            this.$('#ph-wizard-buttons').show();
        }
    },

    lastPage: function() {
        return ((this.pages.length > 1) &&
            ((this.pages.length - 1) == this.currentPageNum));
    },

    finish: function() {
        this.parent.$('#install-rockon-overlay').overlay().close();
        this.parent.render();
    }
});

RockonShareChoice = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_install_choice;
        this.vol_template = window.JST.rockons_vol_form;
        this.rockon = this.model.get('rockon');
        this.volumes = this.model.get('volumes');
        this.shares = new ShareCollection();
        this.shares.setPageSize(100);
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
        this.shares.on('reset', this.renderVolumes, this);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.shares.fetch();
        return this;
    },

    renderVolumes: function() {
        this.$('#ph-vols-table').html(this.vol_template({
            volumes: this.volumes.toJSON(),
            shares: this.shares.toJSON()
        }));
        //form validation
        this.volForm = this.$('#vol-select-form');
        var rules = {};
        var messages = {};
        this.volumes.each(function(volume) {
            rules[volume.id] = {
                required: true
            };
            messages[volume.id] = 'Please read the tooltip and make the right selection';
        });
        this.validator = this.volForm.validate({
            rules: rules,
            messages: messages
        });
    },

    save: function() {

        // Validate the form
        if (!this.volForm.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }

        var share_map = {};
        var volumes = this.volumes.filter(function(volume) {
            share_map[this.$('#' + volume.id).val()] = volume.get('dest_dir');
            return volume;
        }, this);
        this.model.set('share_map', share_map);
        return $.Deferred().resolve();
    }
});

RockonPortChoice = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_port_choice;
        this.port_template = window.JST.rockons_ports_form;
        this.ports = this.model.get('ports');
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.$('#ph-ports-form').html(this.port_template({
            ports: this.ports.toJSON()
        }));

        // Add form validation
        this.portForm = this.$('#port-select-form');
        var rules = {};
        var messages = {};
        this.ports.each(function(port) {
            rules[port.id] = {
                required: true,
                number: true
            };
            messages[port.id] = 'Please enter a valid port number';
        });
        this.validator = this.portForm.validate({
            rules: rules,
            messages: messages
        });
        return this;
    },

    save: function() {

        // Validate the form
        if (!this.portForm.valid()) {
            this.validator.showErrors();
            // return rejected promise so that the wizard doesn't proceed to the next page.
            return $.Deferred().reject();
        }

        var port_map = {};
        var cports = this.ports.filter(function(port) {
            port_map[this.$('#' + port.id).val()] = port.get('containerp');
            return port;
        }, this);
        this.model.set('port_map', port_map);
        return $.Deferred().resolve();
    },
});

RockonCustomChoice = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_custom_choice;
        this.cc_template = window.JST.rockons_cc_form;
        this.custom_config = this.model.get('custom_config');
        this.initHandlebarHelpers();
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        //@todo: working only for the ownCloud and Discourse rockons. Fix to work for the rest
        this.$('#ph-cc-form').html(this.cc_template({
            cc: this.custom_config.toJSON()
        }));
        this.cc_form = this.$('#custom-choice-form');
        var rules = {};
        var messages = {};
        this.custom_config.each(function(cc) {
            rules[cc.id] = 'required';
            messages[cc.id] = 'This is a required field.';
        });
        this.validator = this.cc_form.validate({
            rules: rules,
            messages: messages
        });
        return this;
    },

    save: function() {
        if (!this.cc_form.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }
        var cc_map = {};
        var cconfigs = this.custom_config.filter(function(cc) {
            cc_map[cc.get('key')] = this.$('#' + cc.id).val();
            return cc;
        }, this);
        this.model.set('cc_map', cc_map);
        return $.Deferred().resolve();
    },

    initHandlebarHelpers: function() {
        Handlebars.registerHelper('findInputType', function(ccLabel) {
            if (ccLabel.match(/password/i)) {
                return true;
            }
            return false;
        });
    }
});

RockonDeviceChoice = RockonCustomChoice.extend({
    initialize: function() {
        this.template = window.JST.rockons_device_choice;
        this.device_template = window.JST.rockons_device_form;
        this.device_config = this.model.get('devices');
        this.initHandlebarHelpers();
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.$('#ph-device-form').html(this.device_template({
            device: this.device_config.toJSON()
        }));
        this.device_form = this.$('#device-choice-form');
        this.$('#ph-device-form').html(this.device_template({
            device: this.device_config.toJSON()
        }));
        this.device_form = this.$('#device-choice-form');

        // Add form validation
        var rules = {};
        var messages = {};
        this.device_config.each(function(device) {
            rules[device.id] = {
                checkDevice: true,
                required: false
            };
        });

        $.validator.addMethod('checkDevice', function(value, element) {
            var regExp = new RegExp(/^\/dev\/[A-Za-z0-9,-/ ]+$/);
            return this.optional(element) || regExp.test(value);
        }, 'Please enter a valid absolute path.');

        this.validator = this.device_form.validate({
            rules: rules,
            messages: messages
        });
        return this;
    },

    save: function() {
        if (!this.device_form.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }
        var dev_map = {};
        var devices = this.device_config.filter(function(cdev) {
            dev_map[cdev.get('dev')] = this.$('#' + cdev.id).val();
            return cdev;
        }, this);
        this.model.set('dev_map', dev_map);
        return $.Deferred().resolve();
    }
});

RockonEnvironment = RockonCustomChoice.extend({
    initialize: function() {
        RockonCustomChoice.prototype.initialize.apply(this, arguments);
        this.custom_config = this.model.get('environment');
    },

    save: function() {
        if (!this.cc_form.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }
        var env_map = {};
        var envars = this.custom_config.filter(function(cvar) {
            env_map[cvar.get('key')] = this.$('#' + cvar.id).val();
            return cvar;
        }, this);
        this.model.set('env_map', env_map);
        return $.Deferred().resolve();
    }
});

RockonInstallSummary = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_install_summary;
        this.table_template = window.JST.rockons_summary_table;
        this.share_map = this.model.get('share_map');
        this.port_map = this.model.get('port_map');
        this.cc_map = this.model.get('cc_map');
        this.dev_map = this.model.get('dev_map');
        this.env_map = this.model.get('env_map');
        this.ports = this.model.get('ports');
        this.devices = this.model.get('devices');
        this.environment = this.model.get('environment');
        this.cc = this.model.get('custom_config');
        this.rockon = this.model.get('rockon');
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.$('#ph-summary-table').html(this.table_template({
            share_map: this.share_map,
            port_map: this.port_map,
            cc_map: this.cc_map,
            dev_map: this.dev_map,
            env_map: this.env_map
        }));
        return this;
    },

    save: function() {
        var _this = this;
        //$('button#next-page').prop('disable', true);
        document.getElementById('next-page').disabled = true;
        return $.ajax({
            url: '/api/rockons/' + this.rockon.id + '/install',
            type: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify({
                'ports': this.port_map,
                'shares': this.share_map,
                'cc': this.cc_map,
                'devices': this.dev_map,
                'environment': this.env_map
            }),
            success: function() {
                document.getElementById('next-page').disabled = false;
            },
            error: function(request, status, error) {}
        });
    },
});

RockonInstallComplete = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_install_complete;
        this.port_map = this.model.get('port_map');
        this.share_map = this.model.get('share_map');
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        $(this.el).html(this.template({
            model: this.model,
            port_map: this.port_map,
            share_map: this.share_map
        }));
        return this;
    }

});

RockonInfoView = WizardView.extend({
    initialize: function() {
        WizardView.prototype.initialize.apply(this, arguments);
        this.pages = [RockonInfoSummary, ];
    },

    render: function() {
        WizardView.prototype.render.apply(this, arguments);
        return this;
    },

    modifyButtonText: function() {
        this.$('#prev-page').hide();
        this.$('#next-page').hide();
    }
});

RockonSettingsWizardView = WizardView.extend({
    events: {
        'click #next-page': 'nextPage',
        'click #prev-page': 'prevPage',
        'click #add-label': 'addLabels',
        'click #edit-ports': 'editPorts'
    },

    initialize: function() {
        WizardView.prototype.initialize.apply(this, arguments);
        console.log('this is RockonSettingsWizardView');
        this.template = window.JST.rockons_wizard_summary;
        this.pages = [RockonSettingsSummary, ];
        this.rockon = this.model.get('rockon');
        this.volumes = new RockOnVolumeCollection(null, {
            rid: this.rockon.id
        });
        this.ports = new RockOnPortCollection(null, {
            rid: this.rockon.id
        });
        this.custom_config = new RockOnCustomConfigCollection(null, {
            rid: this.rockon.id
        });
        this.devices = new RockOnDeviceCollection(null, {
            rid: this.rockon.id
        });
        this.environment = new RockOnEnvironmentCollection(null, {
            rid: this.rockon.id
        });
        this.labels = new RockOnLabelCollection(null, {
            rid: this.rockon.id
        });
        this.containers = new ContainerCollection(null, {
            rid: this.rockon.id
        });
        this.rocknets = new RockOnNetworkCollection(null, {
            rid: this.rockon.id
        });

        this.shares = {};
        this.model.set('shares', this.shares);
        this.new_labels = {};
        this.model.set('new_labels', this.new_labels);
        this.networks = new NetworkConnectionCollection();
        this.model.set('networks', this.networks);
        this.evAgg.bind('addLabels', this.addLabels, this);
    },

    fetchVolumes: function() {
        var _this = this;
        this.volumes.fetch({
            success: function() {
                _this.model.set('volumes', _this.volumes);
                _this.fetchPorts();
            }
        });
    },

    fetchPorts: function() {
        var _this = this;
        this.ports.fetch({
            success: function() {
                _this.model.set('ports', _this.ports);
                _this.fetchDevices();
            }
        });
    },

    fetchDevices: function() {
        var _this = this;
        this.devices.fetch({
            success: function() {
                _this.model.set('devices', _this.devices);
                _this.fetchCustomConfig();
            }
        });
    },

    fetchCustomConfig: function() {
        var _this = this;
        this.custom_config.fetch({
            success: function() {
                _this.model.set('custom_config', _this.custom_config);
                _this.fetchEnvironment();
            }
        });
    },

    fetchEnvironment: function() {
        var _this = this;
        this.environment.fetch({
            success: function() {
                _this.model.set('environment', _this.environment);
                _this.fetchContainers();
            }
        });
    },

    fetchContainers: function() {
        var _this = this;
        this.containers.fetch({
            success: function() {
                _this.model.set('containers', _this.containers);
                _this.fetchLabels();
            }
        });
    },

    fetchLabels: function() {
        var _this = this;
        this.labels.fetch({
            success: function() {
                _this.model.set('labels', _this.labels);
                _this.fetchRocknets();
            }
        });
    },

    fetchRocknets: function() {
        var _this = this;
        this.rocknets.fetch({
            success: function() {
                _this.model.set('rocknets', _this.rocknets);
                _this.addPages();
            }
        });
    },

    addLabels: function() {
        this.pages[1] = RockonAddLabel;
        this.pages[2] = RockonSettingsSummary;
        this.pages[3] = RockonSettingsComplete;
        WizardView.prototype.render.apply(this, arguments);
        return this;
    },

    editPorts: function() {
        this.pages[1] = RockonEditPorts;
        this.pages[2] = RockonSettingsSummary;
        this.pages[3] = RockonSettingsComplete;
        WizardView.prototype.render.apply(this, arguments);
        return this;
    },


    render: function() {
        this.fetchVolumes();
        return this;
    },

    addPages: function() {
        if (this.rockon.get('volume_add_support')) {
            this.pages.push.apply(this.pages, [RockonAddShare, RockonSettingsSummary,
                RockonSettingsComplete
            ]);
        }
        WizardView.prototype.render.apply(this, arguments);
        return this;
    },

    setCurrentPage: function() {
        this.currentPage = new this.pages[this.currentPageNum]({
            model: this.model,
            parent: this,
            evAgg: this.evAgg
        });
        console.log('this.currentPage is now = ', this.currentPageNum);
        console.log('this.pages length is = ', this.pages.length);
    },

    modifyButtonText: function() {
        console.log('modifyButtonText has been triggered');
        if (this.currentPageNum == 0) {
            this.$('#prev-page').hide();
            this.$('#add-label').html('Add Label');
            this.$('#add-label').css({'display': 'inline'});
            this.$('#edit-ports').show();
            this.$('#next-page').html('Add Storage');
            if (!this.rockon.get('volume_add_support')) {
                this.$('#next-page').hide();
            }
            if (this.rockon.get('status') == 'started') {
                var _this = this;
                this.$('.wizard-btn').click(function () {
                    //disabling the button so that the backbone event is not triggered after the alert click.
                    _this.$('.wizard-btn').prop('disabled', true);
                    alert('Rock-on must be turned off to change its settings.');
                });
            } else if (this.rockon.get('host_network')) {
                var _this = this;
                this.$('#edit-ports').click(function () {
                    //disabling the button so that the backbone event is not triggered after the alert click.
                    _this.$('#edit-ports').prop('disabled', true);
                    alert('Network settings cannot be altered for this rock-on as it uses host networking.');
                });
            }
        } else if (this.currentPageNum == (this.pages.length - 2)) {
            this.$('#prev-page').show();
            this.$('#next-page').html('Next');
        } else if (this.currentPageNum == (this.pages.length - 1)) {
            this.$('#prev-page').show();
            this.$('#add-label').hide();
            this.$('#edit-ports').hide();
            this.$('#next-page').html('Submit');
        } else {
            this.$('#prev-page').show();
            this.$('#add-label').hide();
            this.$('#edit-ports').hide();
            this.$('#next-page').html('Next');
            this.$('#ph-wizard-buttons').show();
        }
    },

    lastPage: function() {
        return ((this.pages.length > 1) &&
            ((this.pages.length - 1) == this.currentPageNum));
    },

    finish: function() {
        this.parent.$('#install-rockon-overlay').overlay().close();
        this.parent.render();
    }

});

RockonAddShare = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_add_shares;
        this.sub_template = window.JST.rockons_add_shares_form;
        this.shares = new ShareCollection();
        this.shares.setPageSize(100);
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
        this.shares.on('reset', this.renderShares, this);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.shares.fetch();
        return this;
    },

    renderShares: function() {
        this.share_map = this.model.get('shares');
        this.volumes = this.model.get('volumes');
        this.used_shares = [];
        var _this = this;
        this.volumes.each(function(volume, index) {
            _this.used_shares.push(volume.get('share_name'));
        });
        for (var s in this.share_map) {
            this.used_shares.push(s);
        }
        this.filtered_shares = this.shares.filter(function(share) {
            if (_this.used_shares.indexOf(share.get('name')) == -1) {
                return share;
            }
        }, this);
        this.$('#ph-add-shares-form').html(this.sub_template({
            shares: this.filtered_shares.map(function(s) {
                return s.toJSON();
            })
        }));
        this.share_form = this.$('#vol-select-form');
        this.validator = this.share_form.validate({
            rules: {
                'volume': 'required',
                'share': 'required'
            },
            messages: {
                'volume': 'Must be a valid unix path. Eg: /data/media',
                'share': 'Select an appropriate Share to map'
            }
        });
        return this;
    },

    save: function() {
        if (!this.share_form.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }
        this.share_map = this.model.get('shares');
        this.share_map[this.$('#volume').val()] = this.$('#share').val();
        this.model.set('shares', this.share_map);
        return $.Deferred().resolve();
    }
});

RockonAddLabel = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_add_labels;
        this.sub_template = window.JST.rockons_add_labels_form;
        this.rockon = this.model.get('rockon');
        this.containers = new ContainerCollection(null, {
            rid: this.rockon.id
        });
        this.containers.setPageSize(100);
        this.count = 1;
        this.maxlabels = 10; // Define maximum numbers of labels
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
        this.containers.on('reset', this.renderContainers, this);
    },

    events: {
        'click #b1': 'addField',
        'click .remove-me': 'removeField'
    },

    addField: function(event) {
        event.preventDefault();
        var count = this.count;
        if (count < this.maxlabels) {
            count++;
            this.count = count;
            var nbox = '<div id="label-box' + count +'" class="form-group">' +
                '<label class="col-sm-3 control-label" for="labels">Label:  <span class="required">*</span></label>' +
                '<div class="controls col-sm-5">' +
                '<input class="form-control input-btn" name="labels[]" id="field' + count +'" placeholder="Enter another label" type="text" />' +
                '<button id="remove_' + count + '" class="btn btn-danger remove-me">-</button>' +
                '<button id="b1" class="btn" type="button">+</button>' +
                '</div>' +
                '<i class="fa fa-info-circle fa-lg" title="Enter the desired label in the following form: mycustomlabel"></i>' +
                '</div>';
            var newbox = $(nbox);
            $('.label-box-new').append(newbox);
        } else {
            alert('Maximum number of labels reached.');
        }
    },

    removeField: function(event) {
        event.preventDefault();
        var count = this.count;
        $(event.currentTarget).parent('div').parent('div').remove();
        count--;
        this.count = count;
        return this;
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.containers.fetch();
        return this;
    },

    fetchContainers: function() {
        var _this = this;
        this.containers.fetch({
            success: function() {
                _this.model.set('containers', _this.containers);
            }
        });
        return this;
    },

    renderContainers: function() {
        this.containers_map = this.model.get('containers');
        this.used_containers = [];
        var _this = this;
        for (var c in this.containers_map) {
            this.used_containers.push(c);
        }
        this.filtered_containers = this.containers.filter(function(container) {
            if (_this.used_containers.indexOf(container.get('name')) == -1) {
                return container;
            }
        }, this);
        this.$('#ph-add-labels-form').html(this.sub_template({
            containers: this.filtered_containers.map(function(c) {
                return c.toJSON();
            })
        }));
        this.container_form = this.$('#container-select-form');
        this.validator = this.container_form.validate({
            rules: {
                'container': 'required',
                'labels[]': 'required'
            },
            messages: {
                'container': 'Please select a container',
                'labels[]': 'Please enter a label'
            }
        });
        // Ensure previous page is correct
        if (this.rockon.get('volume_add_support')) {
            this.parent.pages[1] = RockonAddShare;
        } else {
            this.parent.pages[1] = RockonAddLabel;
        }
        return this;
    },

    save: function() {
        if (!this.container_form.valid()) {
            this.validator.showErrors();
            return $.Deferred().reject();
        }
        var field_data = $('input[name^=labels]').map(function(idx, elem) {
            if ($(elem).val() != '') {
                return $(elem).val();
            }
        }).get();
        var new_labels = {};
        console.log('field_data is = ', field_data);
        field_data.forEach(function (prop) {
            new_labels[prop] = this.$('#container').val();
        });
        console.log('new_labels is = ', new_labels);
        this.new_labels = new_labels;
        this.model.set('new_labels', this.new_labels);
        return $.Deferred().resolve();
    }
});

RockonEditPorts = RockstorWizardPage.extend({
    initialize: function() {
        this.template = window.JST.rockons_edit_ports;
        this.sub_template = window.JST.rockons_edit_ports_form;
        this.rockon = this.model.get('rockon');
        this.ports = new RockOnPortCollection(null, {
            rid: this.rockon.id
        });
        this.networks = new NetworkConnectionCollection();
        // this.networks.on('reset', this.renderPorts, this);
        this.containers = new ContainerCollection(null, {
            rid: this.rockon.id
        });
        // this.containers.setPageSize(100);
        console.log('This is the RockonEditPorts class, with this = ', this);
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
        // this.ports.on('reset', this.renderPorts, this);
    },

    render: function() {
        console.log('start render');
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.fetchPorts();
        // this.ports.fetch();
        // this.containers.fetch();
        // this.networks.fetch();
        return this;
    },

    fetchPorts: function() {
        console.log('start fetchPorts');
        var _this = this;
        this.ports.fetch({
            success: function() {
                _this.model.set('ports', _this.ports);
                _this.fetchContainers();
            }
        });
    },

    fetchContainers: function() {
        console.log('start fetchContainers');
        var _this = this;
        this.containers.fetch({
            success: function() {
                _this.model.set('containers', _this.containers);
                _this.fetchNetworks();
            }
        });
    },

    fetchNetworks: function() {
        console.log('start fetchNetworks');
        var _this = this;
        this.networks.fetch({
            success: function() {
                _this.model.set('networks', _this.networks);
                _this.renderPorts();
            }
        });
    },

    renderPorts: function() {
        console.log('start renderPorts');
        // this.containers_map = this.model.get('containers');
        // this.used_containers = [];
        // for (var c in this.containers_map) {
        //     this.used_containers.push(c);
        // }
        // this.filtered_containers = this.containers.filter(function(container) {
        //     if (_this.used_containers.indexOf(container.get('name')) == -1) {
        //         return container;
        //     }
        // }, this);
        // this.ports_map = this.model.get('ports');
        // this.used_ports = [];
        // // var _this = this;
        // for (var p in this.ports_map) {
        //     this.used_ports.push(p);
        // }
        // this.filtered_ports = this.ports.filter(function(port) {
        //     if (_this.used_ports.indexOf(port.get('label')) == -1) {
        //         return port;
        //     }
        // }, this);

        var _this = this;
        console.log('this.networks at renderPorts start = ', this.model.get('networks'));
        console.log('this.networks.length is = ', this.model.get('networks').length);

        console.log('this.containers is = ', this.model.get('containers'));
        console.log('this.containers.length is = ', this.model.get('containers').length);

        // this.used_networks = [];
        // this.networks.each(function(network, index) {
        //     _this.used_networks.push(network);
        // });
        // console.log('this.used_networks = ', this.used_networks);

        //
        // this.filtered_networks = this.networks.filter(function(NetworkConnection) {
        //     if (NetworkConnection.get('user_dnet') == 'true') {
        //         return NetworkConnection;
        //     }
        // }, this);
        // console.log('filtered_networks = ', this.filtered_networks);
        // var user_dnets = this.networks.userDnet();
        // user_dnets.fetch();
        // console.log('user_dnets is = ', user_dnets);

        // Fetch list of docker networks available to be used as rocknets
        this.user_dnets = [];
        for (var i = 0; i < this.networks.length; i++) {
            var n = this.networks.at(i);
            if (n.get('user_dnet')) {
                this.user_dnets.push(n.toJSON());
            }
        }
        console.log('this.user_dnets is = ', this.user_dnets);


        // this.model.set('networks', this.networks);
        // console.log('this.networks is = ', this.networks);
        // console.log('this.networks.toJSON() is = ', this.networks.toJSON());

        this.$('#ph-edit-ports-form').html(this.sub_template({
            // containers: this.filtered_containers.map(function(c) {
            //     return c.toJSON();
            // }),
            ports: this.model.get('ports').toJSON(),
            user_dnets: this.user_dnets,
            // networks: this.model.get('networks').toJSON()
            // networks: this.networks.toJSON(),
            // networks: this.networks.map(function(n) {
            //     return n.toJSON();
            // })
            containers: this.containers.map(function(c) {
                return c.toJSON();
            })
        }));

        // Initialize and configure Rocknets choice form
        this.$('.form-control').each(function(index, element) {
            $(this).select2({
                dropdownParent: $('#install-rockon-overlay'),
                width: '80%',
                createTag: function (params) {
                    var excluded = ['host', 'bridge', 'null'];
                    if (
                        params.term.match(/^[a-zA-Z0-9]+$/g)
                        && excluded.indexOf(params.term) === -1
                    ) {
                        return {
                            id: params.term,
                            text: params.term
                        };

                        return null;
                    }
                },
                tags: true
            });
        });

        // Preselect networks fields with currently attached rocknets
        console.log('this.model.rocknets.length is = ', this.model.get('rocknets').length);
        console.log('this.containers.length is = ', this.containers.length);
        if (this.model.get('rocknets').length > 0) {
            this.rocknets = this.model.get('rocknets');
            this.rocknets_map = {};
            for (var i = 0; i < this.containers.length; i++) {
                var c = this.containers.at(i);
                var cname = c.get('name');
                console.log('container name cname is = ', cname);
                // this.rocknets_map['container'] = cname;
                this.rocknets_map[cname] = [];
            }
            console.log('this.rocknets_map after container init = ', this.rocknets_map);
            for (var i = 0; i < this.rocknets.length; i++) {
                var r = this.rocknets.at(i);
                console.log('r.docker_name is = ', r.get('docker_name'));
                console.log('r.container_name is = ', r.get('container_name'));
                var rcname = r.get('container_name');
                var rdname = r.get('docker_name');
                this.rocknets_map[rcname].push(rdname);
            }
            console.log('this.rocknets_map is = ', this.rocknets_map);
            for (var k in this.rocknets_map) {
                if (this.rocknets_map.hasOwnProperty(k)) {
                    console.log('The selected rocknets for container %s are %s', k, this.rocknets_map[k]);
                    this.$('#' + k).val(this.rocknets_map[k]);
                    this.$('#' + k).trigger('change');
                }
            }
        }

        console.log('This during renderPorts', this);

        // Ensure previous page is correct
        if (this.rockon.get('volume_add_support')) {
            this.parent.pages[1] = RockonEditPorts;
        } else {
            this.parent.pages[1] = RockonEditPorts;
        }
        return this;
    },

    save: function() {
        console.log('save() was triggered');

        // // Verify that settings were altered
        // 1. change in ports' publish state?
        // Get ports publish states from form
        var edit_ports = {};
        // $('input[name^=publish]').map(function(idx, elem) {
        $('.ports-group').map(function(idx, elem) {
            var pstatus = 'unchecked';
            if ($(elem).attr('checked') === 'checked') {
                pstatus = 'checked';
            }
            return edit_ports[$(elem).attr('id')] = pstatus;
        }).get();
        console.log('edit_ports is = ', edit_ports);

        // Get current published ports from database
        var psDb = {};
        this.ports.each(function (port) {
            var state = "unchecked";
            if (port.attributes.publish) {
                state = "checked";
            }
            psDb[port.id] = state;
        });
        console.log('psDb = ', psDb);

        // 2. change in rocknets?
        // Get join-networks data
        var _this = this;
        var rocknets_data = _this.$('#join-networks').getJSON();
        Object.keys(rocknets_data).forEach((key) =>
            (rocknets_data[key] === null) && delete rocknets_data[key]);
        console.log('rocknets_data is = ', rocknets_data);

        // Compare to rocknets in database
        var differentRocknets = function (new_nets, reference) {
            /**
             * Compare the newly-defined rocknets attached to one
             * or more containers in a rock-on, to those already
             * existing in the database (if any).
             * It returns 'true' if the two differ.
             * @param {string} new_nets Rocknets object newly-defined
             *                 in the form
             * @param {string} reference Rocknets object already defined
             *                 in the database
             * @return {string} true if both objects differ,
             *                  false otherwise
             */
            if (typeof reference === 'undefined') {
                console.log('reference is undefined');
                return Object.keys(new_nets).length > 0;
            } else {
                // get keys of each object
                var new_keys = Object.keys(new_nets);
                if (!new_keys.length > 0) {
                    console.log('new_nets is emtpy');
                    return true;
                } else {
                    var ref_keys = Object.keys(reference);
                    // Compare how many containers have rocknets
                    if (new_keys.length != ref_keys.length) {
                        console.log('The number of containers with rocknet differ');
                        return true;
                    }
                    // for each key, compare arrays
                    var new_entries = Object.entries(new_nets);
                    var ref_entries = Object.entries(reference);
                    for (var [key, nets] of new_entries) {
                        // Get all needed values
                        if (nets !== null) {
                            console.log('the new key is ', key);
                            console.log('the new nets are ', nets);
                            var ref_val = ref_entries[ref_keys.indexOf(key)][1];
                            console.log('ref_val is ', ref_val);
                            var new_len = nets.length;
                            var ref_len = ref_val.length;
                            console.log('new_len is ', new_len);
                            console.log('ref_len is ', ref_len);
                            // Compare lengths
                            if (new_len != ref_len) {
                                return true;
                            }
                            // Compare individual values
                            if (!nets.every(e => ref_val.includes(e))) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }
        };

        console.log('Do Rocknets differ? ', differentRocknets(rocknets_data, this.rocknets_map));

        // if (this.ports_form.valid()) {
        if (JSON.stringify(edit_ports) !== JSON.stringify(psDb)) {
            console.log('ports_form differs from database');
            var update_mode = 'normal';
        } else if (differentRocknets(rocknets_data, this.rocknets_map)) {
            console.log('ports_form is NOT valid and Rocknets differ');
            update_mode = 'live';
        } else {
            console.log('ports_form is NOT valid and Rocknet do NOT differ');
            // this.ports_validator.showErrors();
            alert('Please customize either ports or rocknets before proceeding further.')
            return $.Deferred().reject();
        }
        console.log('Update_mode is set as ', update_mode);

        // if (!this.ports_form.valid()) {
        //     console.log('ports_form is NOT valid');
        //     this.ports_validator.showErrors();
        //     return $.Deferred().reject();
        // }

        // var field_data = $('input[name^=publish]').map(function(idx, elem) {
        //     return $(elem).attr('checked');
        // }).get();


        // Get join-networks data
        // var field_data = $(".form-control").val();
        // var s2_data = $(".form-control").select2('data');
        // var net_data3 = _this.$('#join-networks').serializeArray();
        // var cnets2 = {};
        // for (var i = 0; i < net_data3.length; i++){
        //     cnets2[net_data3[i]['value']] = net_data3[i]['name'];
        //     };
        // console.log('field_data is = ', field_data);
        // console.log('s2_data is = ', s2_data);
        // console.log('net_data3 is = ', net_data3);
        // console.log('cnets2 is = ', cnets2);

        // Save to model
        this.edit_ports = edit_ports;
        this.model.set('edit_ports', this.edit_ports);
        this.new_cnets = rocknets_data;
        this.model.set('new_cnets', this.new_cnets);
        this.model.set('update_mode', update_mode);

        console.log('Print this = ', this);
        return $.Deferred().resolve();
    }
});

RockonInfoSummary = RockstorWizardPage.extend({
    initialize: function() {
        console.log('This is RockonInfoSummary');
        this.template = window.JST.rockons_settings_summary;
        this.sub_template = window.JST.rockons_more_info;
        this.rockon = this.model.get('rockon');
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        this.$('#ph-settings-summary-table').html(this.sub_template({
            rockonMoreInfo: this.rockon.get('more_info')
        }));
        return this;
    }
});

RockonSettingsSummary = RockstorWizardPage.extend({
    initialize: function() {
        console.log('this is RockonSettingsSummary');
        this.template = window.JST.rockons_settings_summary;
        this.sub_template = window.JST.rockons_settings_summary_table;
        this.rockon = this.model.get('rockon');
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
        this.initHandlebarHelpers();
    },

    render: function() {
        RockstorWizardPage.prototype.render.apply(this, arguments);
        console.log('Print THIS at RockonSettingsSummary render: ', this);
        this.$('#ph-settings-summary-table').html(this.sub_template({
            model: this.model,
            volumes: this.model.get('volumes').toJSON(),
            new_volumes: this.model.get('shares'),
            ports: this.model.get('ports').toJSON(),
            cc: this.model.get('custom_config').toJSON(),
            device: this.model.get('devices').toJSON(),
            env: this.model.get('environment').toJSON(),
            labels: this.model.get('labels').toJSON(),
            new_labels: this.model.get('new_labels'),
            rocknets: this.model.get('rocknets').toJSON(),
            new_cnets: this.model.get('new_cnets'),
            rockon: this.model.get('rockon')
        }));
        // Ensure previous page is correct
        if (!$.isEmptyObject(this.model.get('new_labels'))) {
            console.log('New_labels is defined');
            this.parent.pages[1] = RockonAddLabel;
        } else if (!$.isEmptyObject(this.model.get('new_cnets')) ||
            typeof this.model.get('update_mode') !== 'undefined') {
            console.log('New_cnets or update_mode is defined');
            this.parent.pages[1] = RockonEditPorts;
        } else {
            console.log('neither labels nor ports or rocknets are defined')
            if (this.rockon.get('volume_add_support')) {
                this.parent.pages[1] = RockonAddShare;
            } else {
                this.parent.pages[1] = RockonAddLabel;
            }
        }
        return this;
    },

    initHandlebarHelpers: function() {
        Handlebars.registerHelper('display_newVolumes', function() {
            // Display newly-defined shares and their corresponding mapping
            // for confimation before submit in settings_summary_table.jst
            var html = '';
            for (share in this.new_volumes) {
                html += '<tr>';
                html += '<td>Share</td>';
                html += '<td>' + this.new_volumes[share] + '</td>';
                html += '<td>' + share + '</td>';
                html += '</tr>';
            }
            return new Handlebars.SafeString(html);
        });
        Handlebars.registerHelper('display_newLabels', function() {
            // Display newly-defined labels and their corresponding container
            // for confimation before submit in settings_summary_table.jst
            var html = '';
            for (new_label in this.new_labels) {
                html += '<tr>';
                html += '<td>Label</td>';
                html += '<td>' + this.new_labels[new_label] + '</td>';
                html += '<td>' + new_label + '</td>';
                html += '</tr>';
            }
            return new Handlebars.SafeString(html);
        });
        Handlebars.registerHelper('display_newCnets', function() {
            // Display newly-defined rocknets and their corresponding container
            // for confirmation before submit in settings_summary_table.jst
            var html = '';
            for (new_cnet in this.new_cnets) {
                html += '<tr>';
                html += '<td>Network</td>';
                html += '<td>' + new_cnet + '</td>';
                html += '<td>' + this.new_cnets[new_cnet] + '</td>';
                html += '</tr>';
            }
            return new Handlebars.SafeString(html);
        });
        var _this = this;
        Handlebars.registerHelper('isPublished', function(port, state) {
            // Adds "(Unpublished)" text next to the port number
            // if it is (or set to be) unpublished
            var html = '';
            if (_this.model.get('edit_ports')){
                var edit_ports = _this.model.get('edit_ports');
                if (edit_ports[port] == 'unchecked') {
                    html += ' (Unpublished)';
                }
            } else {
                if(state != true) {
                    html += ' (Unpublished)';
                }
            }
            return new Handlebars.SafeString(html);
        });
    }
});

RockonSettingsComplete = RockstorWizardPage.extend({
    initialize: function() {
        console.log('This is RockonSettingsComplete');
        this.template = window.JST.rockons_update_complete;
        this.rockon = this.model.get('rockon');
        this.shares = this.model.get('shares');
        this.new_labels = this.model.get('new_labels');
        this.edit_ports = this.model.get('edit_ports');
        this.new_cnets = this.model.get('new_cnets');
        this.update_mode = this.model.get('update_mode');
        console.log('this.edits_portJSON = ', JSON.stringify({
            'labels': this.new_labels,
            'edit_ports': this.edit_ports,
            'new_cnets': this.new_cnets,
            'update_mode': this.update_mode
        }));
        RockstorWizardPage.prototype.initialize.apply(this, arguments);
    },

    render: function() {
        $(this.el).html(this.template({
            model: this.model
        }));
        return this;
    },

    save: function() {
        var _this = this;
        if (document.getElementById('next-page').disabled) return false;
        document.getElementById('next-page').disabled = true;

        // Collect all data to be sent during the API call
        var dataObj = {};
        if (!_.isEmpty(this.shares)) dataObj['shares'] = this.shares;
        if (!_.isEmpty(this.new_labels)) dataObj['labels'] = this.new_labels;
        if (!_.isEmpty(this.edit_ports)) dataObj['edit_ports'] = this.edit_ports;
        if (!_.isEmpty(this.new_cnets)) dataObj['cnets'] = this.new_cnets;
        if (!_.isEmpty(this.update_mode)) dataObj['update_mode'] = this.update_mode;

        // console.log('data sent is = ', JSON.stringify({
        //     'labels': this.new_labels,
        //     'edit_ports': this.edit_ports,
        //     'new_cnets': this.new_cnets,
        //     'update_mode': this.update_mode
        // }));
        console.log('data to be sent is = ', JSON.stringify(dataObj));

        return $.ajax({
            url: '/api/rockons/' + this.rockon.id + '/update',
            type: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            // data: JSON.stringify({
            //     'shares': this.shares,
            //     'labels': this.new_labels,
            //     'edit_ports': this.edit_ports,
            //     'cnets': this.new_cnets,
            //     'update_mode': this.update_mode
            // }),
            data: JSON.stringify(dataObj),
            success: function() {}
        });
    }
});
