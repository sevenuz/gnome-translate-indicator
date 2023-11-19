import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { Fields, SCHEMA_NAME } from './util.js';

export default class TranslateIndicatorPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		window._settings = this.getSettings(SCHEMA_NAME);
		const settingsUI = new Settings(window._settings);
		const page = new Adw.PreferencesPage();
		page.add(settingsUI.ui);
		page.add(settingsUI.notifications);
		page.add(settingsUI.shortcuts);
		window.add(page);
	}
}

class Settings {
	constructor(schema) {
		this.schema = schema;

		this.translateOptionsEntry = new Adw.EntryRow({
			title: _("Default translate options")
		});
		this.translateOptionsEntry.text = this.schema.get_string(Fields.TRANSLATE_OPTIONS);
		this.field_enable_global_trans = new Adw.SwitchRow({
			title: _("Enable global trans")
		});
		this.field_enable_selection = new Adw.SwitchRow({
			title: _("Use selection instead of clipboard on notifications and menu (X.org only)")
		});

		this.field_enable_notification_trans_opt = new Adw.SwitchRow({
			title: _('Enable "Notification translate options"')
		});
		this.notificationTranslateOptionsEntry = new Adw.EntryRow({
			title: _("Notification translate options")
		});
		this.notificationTranslateOptionsEntry.text = this.schema.get_string(Fields.NOTIFICATION_TRANSLATE_OPTIONS);

		this.ui = new Adw.PreferencesGroup({ title: _('UI') });
		this.ui.add(this.translateOptionsEntry);
		this.ui.add(this.field_enable_global_trans);
		this.ui.add(this.field_enable_selection);

		this.notifications = new Adw.PreferencesGroup({ title: _('Notifications') });
		this.notifications.add(this.field_enable_notification_trans_opt);
		this.notifications.add(this.notificationTranslateOptionsEntry);

		this.shortcuts = new Adw.PreferencesGroup({ title: _('Shortcuts') });
		this.buildShorcuts(this.shortcuts);

		this.schema.bind(Fields.TRANSLATE_OPTIONS, this.translateOptionsEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
		this.schema.bind(Fields.ENABLE_NOTIFICATION_TRANSLATE_OPTIONS, this.field_enable_notification_trans_opt, 'active', Gio.SettingsBindFlags.DEFAULT);
		this.schema.bind(Fields.NOTIFICATION_TRANSLATE_OPTIONS, this.notificationTranslateOptionsEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
		this.schema.bind(Fields.ENABLE_GLOBAL_TRANS, this.field_enable_global_trans, 'active', Gio.SettingsBindFlags.DEFAULT);
		this.schema.bind(Fields.ENABLE_SELECTION, this.field_enable_selection, 'active', Gio.SettingsBindFlags.DEFAULT);
	}

	_shortcuts = {
		"translate-with-notification": _("Translate with Notification"),
		"translate-from-selection": _("Toggle the menu"),
	};

	buildShorcuts(group) {
		for (const key in this._shortcuts) {
			const row = new Adw.ActionRow({
				title: this._shortcuts[key]
			});

			row.add_suffix(this.createShortcutButton(key));

			group.add(row);
		}
	}

	createShortcutButton(pref) {
		const button = new Gtk.Button({
			has_frame: false
		});

		const setLabelFromSettings = () => {
			const originalValue = this.schema.get_strv(pref)[0];

			if (!originalValue) {
				button.set_label(_('Disabled'));
			}
			else {
				button.set_label(originalValue);
			}
		};

		const startEditing = () => {
			button.isEditing = button.label;
			button.set_label(_('Enter shortcut'));
		};

		const revertEditing = () => {
			button.set_label(button.isEditing);
			button.isEditing = null;
		};

		const stopEditing = () => {
			setLabelFromSettings();
			button.isEditing = null;
		};

		setLabelFromSettings();

		button.connect('clicked', () => {
			if (button.isEditing) {
				revertEditing();
				return;
			}

			startEditing();

			const eventController = new Gtk.EventControllerKey();
			button.add_controller(eventController);

			let debounceTimeoutId = null;
			const connectId = eventController.connect('key-pressed', (_ec, keyval, keycode, mask) => {
				if (debounceTimeoutId) clearTimeout(debounceTimeoutId);

				mask = mask & Gtk.accelerator_get_default_mod_mask();

				if (mask === 0) {
					switch (keyval) {
						case Gdk.KEY_Escape:
							revertEditing();
							return Gdk.EVENT_STOP;
						case Gdk.KEY_BackSpace:
							this.schema.set_strv(pref, []);
							setLabelFromSettings();
							stopEditing();
							eventController.disconnect(connectId);
							return Gdk.EVENT_STOP;
					}
				}

				const selectedShortcut = Gtk.accelerator_name_with_keycode(
					null,
					keyval,
					keycode,
					mask
				);

				debounceTimeoutId = setTimeout(() => {
					eventController.disconnect(connectId);
					this.schema.set_strv(pref, [selectedShortcut]);
					stopEditing();
				}, 400);

				return Gdk.EVENT_STOP;
			});

			button.show();
		});

		return button;
	}
}

