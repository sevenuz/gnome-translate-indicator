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
const prettyPrint = Utils.prettyPrint;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

let TRANSLATE_OPTIONS = 'trans :en -j ';

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

        this._buildMenu();
        this._loadSettings();
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

        this.searchEntry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._onSearchTextChanged)
        );
        this.inputEntry.get_clutter_text().connect(
            'text-changed',
            Lang.bind(this, this._onInputTextChanged)
        );


        this.menu.addMenuItem(popupMenuExpander);
        this.menu.addMenuItem(menuSection);
    },

    _onSearchTextChanged: function () {
        //TODO new translation
        TRANSLATE_OPTIONS = this.searchEntry.get_text();
        writeRegistry(TRANSLATE_OPTIONS);
    },

    _onInputTextChanged: function () {
        this._showNotification(this.searchEntry.get_text());
    },

    _selectInputEntry: function () {
        this.inputEntry.get_clutter_text().set_selection(0, this.inputEntry.get_clutter_text().text.length);
    },

    _getFromClipboard: function (type = CLIPBOARD_TYPE) {
        let that = this;

        //Clipboard.set_text(CLIPBOARD_TYPE, "");
        Clipboard.get_text(type, function (clipBoard, text) {
            //that._processTranslateContent(text);
        });
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

        readRegistry(function (s) {
            TRANSLATE_OPTIONS = s;
            this.searchEntry.set_text(TRANSLATE_OPTIONS);
        });

        this._bindShortcuts();
    },

    _bindShortcuts: function () {
        this._unbindShortcuts();
        this._bindShortcut(SETTING_KEY_TRANSLATE_NOTIFICATION, this._translateWithPopup);
        this._bindShortcut(SETTING_KEY_TRANSLATE_MENU, this._toggleMenu);
    },

    _translateWithPopup: function () {
      //TODO translate and show popup
      this._showNotification('translated...');
    },

    _toggleMenu: function(){
        //TODO set input from selection
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
