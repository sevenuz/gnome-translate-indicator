const Clutter    = imports.gi.Clutter;
const Gio        = imports.gi.Gio;
const Gtk        = imports.gi.Gtk;
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
const Languages = Me.imports.languages.languages;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

let translate_options = ':en';
let notification_translate_options = ':en -b ';
let enable_notification_translate_options = false;
let enable_global_trans = false;
let enable_selection = false;

const TRANS_CMD = 'trans';
const TRANS_PATH = Me.path + '/'; //'.local/share/gnome-shell/extensions/translate-indicator@athenstaedt.net/';
const SUBMENU_TITLE = 'Translate Options';

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
        this.icon = new St.Icon({
            style_class: 'system-status-icon'
        });
        this.icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/icon.svg`);
        hbox.add_child(this.icon);

        //hbox.add(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);

        this._loadSettings();
        this._buildMenu();
        this._fetchSettings();
    },

    _buildMenu: function () {
        this.popupMenuExpander = new PopupMenu.PopupSubMenuMenuItem(SUBMENU_TITLE);
        let searchLayout = new St.BoxLayout({
            reactive: true,
            x_expand: true,
            y_expand: true,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE,
        });
        let _searchLabel = new St.Label({
            text: _('trans'),
            y_align: Clutter.ActorAlign.CENTER
        });
        this.searchEntry = new St.Entry({
            name: 'searchEntry',
            style_class: 'search-entry',
            can_focus: true,
            hint_text: _('Your translation parameter (-h for help)'),
            track_hover: true
        });
        searchLayout.add_child(_searchLabel);
        searchLayout.add_child(this.searchEntry);
        this.popupMenuExpander.menu.box.add_child(searchLayout);

        //workaround: set text on searchEntry to save in settings
        //this.gtkSearchEntry = new Gtk.Entry({ name: 'gtkSearchEntry' });
        //this._settings.bind(Prefs.Fields.TRANSLATE_OPTIONS, this.gtkSearchEntry, 'text', Gio.SettingsBindFlags.DEFAULT);

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
        actor.add_child(scrollI, {
            x_fill: true,
            y_fill: true,
            expand: true
        });
        actor.add_child(scrollO, {
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
        this.inputEntry.get_clutter_text().set_line_wrap(true);
        this.inputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.inputEntry.get_clutter_text().set_max_length(0);
        //Translate Output
        this.outputEntry = new St.Entry({
            name: 'outputEntry',
            style_class: 'entry',
            can_focus: true,
            hint_text: _('Wait for translation...'),
            track_hover: true
        });
        this.outputEntry.get_clutter_text().set_activatable(true);
        this.outputEntry.get_clutter_text().set_line_wrap(true);
        this.outputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.outputEntry.get_clutter_text().set_single_line_mode(false);
        this.outputEntry.get_clutter_text().set_editable(false);

        let _boxI = new St.BoxLayout({
            vertical: true,
        });
        _boxI.add_child(this.inputEntry, {
            y_align: St.Align.START,
            y_fill: true,
            x_fill: true,
        });
        let _boxO = new St.BoxLayout({
            vertical: true,
        });
        _boxO.add_child(this.outputEntry, {
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

        this.menu.addMenuItem(this.popupMenuExpander);
        this.menu.addMenuItem(menuSection);

        this.menu.connect('open-state-changed', Lang.bind(this, function(self, open){
            let a = Mainloop.timeout_add(50, Lang.bind(this, () => {
                if (open) {
                    if (enable_selection) {
                        this._getFromClipboard(SELECTION_TYPE, (cb, text)=>{
                            this.inputEntry.set_text(text);
                            this.inputEntry.get_clutter_text().grab_key_focus();
                            this._selectInputEntry();
                            if (text !== '')
                                this.outputEntry.set_text('');
                        });
                    } else {
                        this.inputEntry.get_clutter_text().grab_key_focus();
                        this._selectInputEntry();
                    }
                }
                Mainloop.source_remove(a);
            }));
        }));
    },

    _onSearchTextChanged: function () {
        translate_options = this.searchEntry.get_text();
        this.popupMenuExpander.label.set_text(this._getLanguagesOfTranslation() || SUBMENU_TITLE);
        //this.gtkSearchEntry.text = translate_options;
        writeRegistry(translate_options);
    },

    _onInputTextChanged: function () {},

    _on_key_press_event(object, event) {
        let symbol = event.get_key_symbol();
        //let code = event.get_key_code();
        //let state = event.get_state();

        //65293 - Enter
        if (symbol === 65293) {
            this._translate(translate_options, this.inputEntry.get_text()).then((t, err)=>{
                this.outputEntry.get_clutter_text().set_markup(t);
                //this.outputEntry.set_text(t);
            });
        }
    },

    _selectInputEntry: function () {
        this.inputEntry.get_clutter_text().set_selection(0, this.inputEntry.get_text().length);
    },

    _getFromClipboard (type, cb) {
        //Clipboard.set_text(CLIPBOARD_TYPE, "");
        Clipboard.get_text(type, function (clipBoard, text) {
            cb(clipBoard, text);
        });
    },

    _validTranslateOptions (to) {
        let b = to.trim().length>0;
        if (!b)
            this._showNotification('No translation options given!');
        return b;
    },

    _getLanguagesOfTranslation () {
        let s = '';
        const i = translate_options.indexOf(':');
        if(i>=0){
            if (i>1&&translate_options.charAt(i-1)!==' ')
                s += Languages[translate_options.slice(i-2, i)].name || '';
            else
                s += 'Auto-Detection';
            s += ' to ';
            s += Languages[translate_options.slice(i+1, i+3)].name || '';
        }
        return s;
    },

    async _translate (to, str) {
        let opt = (enable_global_trans)?[TRANS_CMD]:[TRANS_PATH+TRANS_CMD];
        if (this._validTranslateOptions(to))
            opt = opt.concat(to.trim().split(' '));
        opt = opt.concat(str.trim());
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
            this.outputEntry.set_text(JSON.stringify({p:Me.dir, error}));
            this._showNotification('Error: ' + JSON.stringify(command));
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
        enable_selection = this._settings.get_boolean(Prefs.Fields.ENABLE_SELECTION);
        enable_global_trans = this._settings.get_boolean(Prefs.Fields.ENABLE_GLOBAL_TRANS);
        enable_notification_translate_options = this._settings.get_boolean(Prefs.Fields.ENABLE_NOTIFICATION_TRANSLATE_OPTIONS);
        notification_translate_options = this._settings.get_string(Prefs.Fields.NOTIFICATION_TRANSLATE_OPTIONS);

        readRegistry((s) => {
            translate_options = s?s:this._settings.get_string(Prefs.Fields.TRANSLATE_OPTIONS);
            this.searchEntry.set_text(translate_options);
            if (typeof cb === 'function')
                cb(s);
        });
        //translate_options = this._settings.get_string(Prefs.Fields.TRANSLATE_OPTIONS);
    },

    _bindShortcuts: function () {
        this._unbindShortcuts();
        this._bindShortcut(SETTING_KEY_TRANSLATE_NOTIFICATION, this._translateWithPopup);
        this._bindShortcut(SETTING_KEY_TRANSLATE_MENU, this._toggleMenu);
    },

    _translateWithPopup: function () {
        this._fetchSettings(()=>{
            this._getFromClipboard((enable_selection)?SELECTION_TYPE:CLIPBOARD_TYPE, (cb, text)=>{
                let to = (enable_notification_translate_options)?notification_translate_options:translate_options;
                if (this._validTranslateOptions(to))
                    this._translate(to, text).then(str=>this._showNotification(str));
            });
        });
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
