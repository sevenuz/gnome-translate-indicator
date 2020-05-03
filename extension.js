const Clutter    = imports.gi.Clutter;
const Gio        = imports.gi.Gio;
const Lang       = imports.lang;
const Mainloop   = imports.mainloop;
const Meta       = imports.gi.Meta;
const Shell      = imports.gi.Shell;
const St         = imports.gi.St;
const Pango      = imports.gi.Pango;
const PolicyType = imports.gi.Gtk.PolicyType;
const Util       = imports.misc.util;
const MessageTray = imports.ui.messageTray;

const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const CheckBox  = imports.ui.checkBox.CheckBox;

const Gettext = imports.gettext;
const _ = Gettext.domain('translate-indicator').gettext;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const SELECTION_TYPE = St.ClipboardType.PRIMARY;

const SETTING_KEY_TRANSLATE_NOTIFICATION = "translate-with-notification";
const SETTING_KEY_TRANSLATE_MENU = "translate-from-selection";
const INDICATOR_ICON = 'insert-text-symbolic';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

const STRING_INDICATOR = '%s';
let TRANSLATE_OPTIONS = 'trans...';
let TIMEOUT_INSTANT_TRANSLATION = 0;

const TranslateIndicator = Lang.Class({
    Name: 'TranslateIndicator',
    Extends: PanelMenu.Button,

    _settingsChangedId: null,
    _translateTimeoutId: null,
    _selectionOwnerChangedId: null,
    _historyLabelTimeoutId: null,
    _historyLabel: null,
    _buttonText:null,

    destroy: function () {
        this._disconnectSettings();
        this._unbindShortcuts();

        // Call parent
        this.parent();
    },

    _init: function() {
        this.parent(0.0, "TranslateIndicator");
        this._shortcutsBindingIds = [];

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box translate-indicator-hbox' });
        this.icon = new St.Icon({ icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon translate-indicator-icon' });
        hbox.add_child(this.icon);
        this._buttonText = new St.Label({
            text: _('Text will be here'),
            y_align: Clutter.ActorAlign.CENTER
        });
        hbox.add_child(this._buttonText);
        //hbox.add(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);

        this._loadSettings();
        this._buildMenu();
        this._fetchSettings();
    },

    _buildMenu: function () {
        let popupMenuExpander = new PopupMenu.PopupSubMenuMenuItem('From "Detect-Language" to "German"');
        this.searchEntry = new St.Entry({
            name: 'searchEntry',
            style_class: 'search-entry',
            can_focus: true,
            hint_text: _('Type here to search...'),
            track_hover: true
        });
        popupMenuExpander.menu.box.add(this.searchEntry);
        //Save in schema doesnt work
        //this._settings.bind(Prefs.Fields.TRANSLATE_OPTIONS, this.searchEntry, 'value', Gio.SettingsBindFlags.DEFAULT);

        let menuSection = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });

        let scrollI = new St.ScrollView({});
        let scrollO = new St.ScrollView({});
        let actor = new St.BoxLayout({
            reactive: true,
            x_expand: true,
            y_expand: true,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE,
            vertical: true
        });
        actor.add(scrollI, {
            x_fill: true,
            y_fill: true,
            expand: true
        });
        actor.add(scrollO, {
            x_fill: true,
            y_fill: true,
            expand: true
        });//Translate Input
        this.inputEntry = new St.Entry({
            name: 'inputEntry',
            style_class: 'entry',
            can_focus: true,
            hint_text: _('Type here to translate...'),
            track_hover: true
        });
        this.inputEntry.get_clutter_text().set_single_line_mode(false);
        //this.inputEntry.get_clutter_text().set_line_wrap(true);
        this.inputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.inputEntry.get_clutter_text().set_max_length(0);
        //Translate Output
        this.outputEntry = new St.Entry({
            name: 'outputEntry',
            style_class: 'entry',
            can_focus: true,
            hint_text: _('Type here to translate...'),
            track_hover: true
        });
        this.outputEntry.get_clutter_text().set_activatable(false);
        this.outputEntry.get_clutter_text().set_single_line_mode(false);
        this.outputEntry.get_clutter_text().set_editable(false);

        let _boxI = new St.BoxLayout({
            vertical: true,
        });
        _boxI.add(this.inputEntry, {
            y_align: St.Align.START,
            y_fill: true,
            x_fill: true,
        });
        let _boxO = new St.BoxLayout({
            vertical: true,
        });
        _boxO.add(this.outputEntry, {
            y_align: St.Align.START,
            y_fill: true,
            x_fill: true,
        });
        scrollI.add_actor(_boxI);
        scrollO.add_actor(_boxO);
        menuSection.actor.add_actor(actor, { expand: true });

        this.searchEntry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._onSearchTextChanged)
        );
        this.searchEntry.get_clutter_text().connect('key-press-event', (object, event) => {
            this._on_key_press_event(object, event);
        });
        this.inputEntry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._onInputTextChanged)
        );
        this.inputEntry.get_clutter_text().connect('key-press-event', (object, event) => {
            this._on_key_press_event(object, event);
        });

        this.menu.addMenuItem(popupMenuExpander);
        this.menu.addMenuItem(menuSection);

        this.menu.connect('open-state-changed', Lang.bind(this, function(self, open){
            let a = Mainloop.timeout_add(50, Lang.bind(this, () => {
                if (open) {
                    this._getFromClipboard(SELECTION_TYPE, (cb, text)=>{
                        that.inputEntry.set_text(text);
                        this._selectInputEntry();
                    });
                    this.inputEntry.get_clutter_text().grab_key_focus();
                }
                Mainloop.source_remove(a);
            }));
        }));
    },

    _onSearchTextChanged: function () {
        TRANSLATE_OPTIONS = this.searchEntry.get_text();
        //this._settings.set_string(Prefs.FIELDS.TRANSLATE_OPTIONS, TRANSLATE_OPTIONS);
        writeRegistry(TRANSLATE_OPTIONS);
        //this._onInputTextChanged();
    },

    _onInputTextChanged: function () {},

    _on_key_press_event(object, event) {
        let symbol = event.get_key_symbol();
        //let code = event.get_key_code();
        //let state = event.get_state();

        //65293 - Enter
        if (symbol === 65293) {
            this._translate(this.inputEntry.get_text()).then((t, err)=>{
                this.outputEntry.get_clutter_text().set_markup(t);
                //this.outputEntry.set_text(t);
            });
        }
    },

    _selectInputEntry: function () {
        this.inputEntry.set_selection(0, this.inputEntry.get_text().length);
    },

    _getFromClipboard (type, cb) {
        //Clipboard.set_text(CLIPBOARD_TYPE, "");
        Clipboard.get_text(type, function (clipBoard, text) {
            cb(clipBoard, text);
        });
    },

    async _translate (str) {
        let opt = TRANSLATE_OPTIONS.split(' ');
        if (TRANSLATE_OPTIONS.indexOf(STRING_INDICATOR) >= 0) {
            opt.forEach((s, i)=>{
                opt[i] = s.replace(STRING_INDICATOR, str)
            });
        } else {
            opt.push(str);
        }
        return this._exec(opt);
    },

    async _exec(command) {
        if (!Array.isArray(command))
            throw 'Parameter has to be an array';
        try {
            let proc = new Gio.Subprocess({
                argv: command,
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });
            proc.init(null);
            return await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (proc, res) => {
                    try {
                        let [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                        resolve(this._escape_translation(stdout));
                    } catch(error) {
                        reject(error);
                    }
                });
            });
        } catch (error) {
            this._showNotification(JSON.stringify(error));
        }
    },

    _escape_translation(str) {
        if (!str) {
            return '';
        }

        let stuff = {
            "\x1B[1m": '<b>',
            "\x1B[22m": '</b>',
            "\x1B[4m": '<u>',
            "\x1B[24m": '</u>'
        };
        str = this._escape_html(str);
        for (let hex in stuff) {
            str = this._replace_all(str, hex, stuff[hex]);
        }
        return str;
    },

    _replace_all(str, find, replace) {
        return (str || '')
            .split(find)
            .join(replace);
    },

    _escape_html(str) {
        return (str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    _initNotifSource: function () {
        if (!this._notifSource) {
            this._notifSource = new MessageTray.Source('TranslateIndicator',
                                    INDICATOR_ICON);
            this._notifSource.connect('destroy', Lang.bind(this, function() {
                this._notifSource = null;
            }));
            Main.messageTray.add(this._notifSource);
        }
    },

    _showNotification: function (message, transformFn) {
        let notification = null;

        this._initNotifSource();

        if (this._notifSource.count === 0) {
            notification = new MessageTray.Notification(this._notifSource, message);
        }
        else {
            notification = this._notifSource.notifications[0];
            notification.update(message, '', { clear: true });
        }

        if (typeof transformFn === 'function') {
            transformFn(notification);
        }

        notification.setTransient(true);
        this._notifSource.notify(notification);
    },

    _loadSettings: function () {
        this._settings = Prefs.SettingsSchema;
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._fetchSettings));

        this._bindShortcuts();
    },

    _fetchSettings: function (cb) {
        readRegistry((s) => {
            TRANSLATE_OPTIONS = s;
            this.searchEntry.set_text(TRANSLATE_OPTIONS);
            if (typeof cb === 'function')
                cb(s);
        });
        //TRANSLATE_OPTIONS = this._settings.get_string(Prefs.Fields.TRANSLATE_OPTIONS);
        //this.searchEntry.set_text(TRANSLATE_OPTIONS);
    },

    _bindShortcuts: function () {
        this._unbindShortcuts();
        this._bindShortcut(SETTING_KEY_TRANSLATE_NOTIFICATION, this._translateWithPopup);
        this._bindShortcut(SETTING_KEY_TRANSLATE_MENU, this._toggleMenu);
    },

    _translateWithPopup: function () {
        this._getFromClipboard(CLIPBOARD_TYPE, (cb, text)=>{
            this._fetchSettings(() => {
                this._translate(text).then(str=>this._showNotification(str));
            });
        });
        //this._showNotification(this._settings.get_string(Prefs.Fields.TRANSLATE_OPTIONS));
    },

    _toggleMenu: function(){
        this.menu.toggle();
    },

    _unbindShortcuts: function () {
        this._shortcutsBindingIds.forEach(
            (id) => Main.wm.removeKeybinding(id)
        );

        this._shortcutsBindingIds = [];
    },

    _bindShortcut: function(name, cb) {
        var ModeType = Shell.hasOwnProperty('ActionMode') ?
            Shell.ActionMode : Shell.KeyBindingMode;

        Main.wm.addKeybinding(
            name,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            ModeType.ALL,
            Lang.bind(this, cb)
        );

        this._shortcutsBindingIds.push(name);
    },

    _disconnectSettings: function () {
        if (!this._settingsChangedId)
            return;

        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
    },
});

function init () {
    let localeDir = Me.dir.get_child('locale');
    Gettext.bindtextdomain('translate-indicator', localeDir.get_path());
}

let translateIndicator;
function enable () {
    translateIndicator = new TranslateIndicator();
    Main.panel.addToStatusArea('translateIndicator', translateIndicator, 1);
}

function disable () {
    translateIndicator.destroy();
}
