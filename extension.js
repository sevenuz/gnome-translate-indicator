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

const SETTING_KEY_CLEAR_HISTORY = "clear-history";
const SETTING_KEY_PREV_ENTRY = "prev-entry";
const SETTING_KEY_NEXT_ENTRY = "next-entry";
const SETTING_KEY_TOGGLE_MENU = "toggle-menu";
const INDICATOR_ICON = 'insert-text-symbolic';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;
const prettyPrint = Utils.prettyPrint;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

let TIMEOUT_MS           = 1000;
let MAX_REGISTRY_LENGTH  = 15;
let MAX_ENTRY_LENGTH     = 50;
let CACHE_ONLY_FAVORITE  = false;
let DELETE_ENABLED       = true;
let MOVE_ITEM_FIRST      = false;
let ENABLE_KEYBINDING    = true;
let PRIVATEMODE          = false;
let NOTIFY_ON_COPY       = true;
let MAX_TOPBAR_LENGTH    = 15;
let TOPBAR_DISPLAY_MODE  = 1; //0 - only icon, 1 - only clipbord content, 2 - both
let STRIP_TEXT           = false;

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
        this.searchEntry.set_text('trans :de -j ');
        popupMenuExpander.menu.box.add(this.searchEntry);

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
        this.inputEntry.get_clutter_text().set_line_wrap(true);
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
        this.outputEntry.get_clutter_text().set_single_line_mode(false);
        this.outputEntry.get_clutter_text().set_activatable(false);

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

        this.inputEntry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._onInputTextChanged)
        );


        this.menu.addMenuItem(popupMenuExpander);
        this.menu.addMenuItem(menuSection);
    },

    _onInputTextChanged: function () {
        this._showNotification(this.searchEntry.get_text());
    },

    _getFromClipboard: function () {
        let that = this;

        //Clipboard.set_text(CLIPBOARD_TYPE, "");
        Clipboard.get_text(CLIPBOARD_TYPE, function (clipBoard, text) {
            //that._processTranslateContent(text);
        });
    },

    _openSettings: function () {
        Util.spawn([
            "gnome-shell-extension-prefs",
            Me.uuid
        ]);
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
            Lang.bind(this, this._onSettingsChange));

        this._fetchSettings();

        if (ENABLE_KEYBINDING)
            this._bindShortcuts();
    },

    _fetchSettings: function () {
        TIMEOUT_MS           = this._settings.get_int(Prefs.Fields.INTERVAL);
        MAX_REGISTRY_LENGTH  = this._settings.get_int(Prefs.Fields.HISTORY_SIZE);
        MAX_ENTRY_LENGTH     = this._settings.get_int(Prefs.Fields.PREVIEW_SIZE);
        CACHE_ONLY_FAVORITE  = this._settings.get_boolean(Prefs.Fields.CACHE_ONLY_FAVORITE);
        DELETE_ENABLED       = this._settings.get_boolean(Prefs.Fields.DELETE);
        MOVE_ITEM_FIRST      = this._settings.get_boolean(Prefs.Fields.MOVE_ITEM_FIRST);
        NOTIFY_ON_COPY       = this._settings.get_boolean(Prefs.Fields.NOTIFY_ON_COPY);
        ENABLE_KEYBINDING    = this._settings.get_boolean(Prefs.Fields.ENABLE_KEYBINDING);
        MAX_TOPBAR_LENGTH    = this._settings.get_int(Prefs.Fields.TOPBAR_PREVIEW_SIZE);
        TOPBAR_DISPLAY_MODE  = this._settings.get_int(Prefs.Fields.TOPBAR_DISPLAY_MODE_ID);
        STRIP_TEXT           = this._settings.get_boolean(Prefs.Fields.STRIP_TEXT);
    },

    _onSettingsChange: function () {
        var that = this;

        // Load the settings into variables
        that._fetchSettings();

        // Bind or unbind shortcuts
        if (ENABLE_KEYBINDING)
            that._bindShortcuts();
        else
            that._unbindShortcuts();
    },

    _bindShortcuts: function () {
        this._unbindShortcuts();
        this._bindShortcut(SETTING_KEY_TOGGLE_MENU, this._toggleMenu);
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

    _toggleMenu: function(){
        this.menu.toggle();
    }
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
