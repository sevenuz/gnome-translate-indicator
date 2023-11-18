import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { Fields, SCHEMA_NAME } from './util.js';

let SettingsSchema; // set in Settings constructor

export default class TranslateIndicatorPreferences extends ExtensionPreferences {
    getPreferencesWidget() {
        let ui = new Settings(this.getSettings(SCHEMA_NAME));
        return ui.main;
    }
}

class Settings {
	constructor(schema) {
		SettingsSchema = schema;
		this.main = new Gtk.Grid({
			row_spacing: 12,
			column_spacing: 18,
			column_homogeneous: false,
			row_homogeneous: false
		});

		this.translateOptionsEntry = new Gtk.Entry({
			name: 'translateOptions',
		});
		this.translateOptionsEntry.text = SettingsSchema.get_string(Fields.TRANSLATE_OPTIONS);
		this.field_enable_global_trans = new Gtk.Switch();
		this.field_enable_selection = new Gtk.Switch();

		this.field_enable_notification_trans_opt = new Gtk.Switch();
		this.notificationTranslateOptionsEntry = new Gtk.Entry({
			name: 'notificationTranslateOptions',
		});
		this.notificationTranslateOptionsEntry.text = SettingsSchema.get_string(Fields.NOTIFICATION_TRANSLATE_OPTIONS);

		this.field_keybinding = createKeybindingWidget(SettingsSchema);
		addKeybinding(this.field_keybinding.model, SettingsSchema, "translate-with-notification",
			_("Translate with Notification"));
		addKeybinding(this.field_keybinding.model, SettingsSchema, "translate-from-selection",
			_("Toggle the menu"));

		let labelTranslateOptions = new Gtk.Label({
			label: _("Default translate options"),
			hexpand: true,
		});
		let labelEnableNotificationTransOpt = new Gtk.Label({
			label: _('Enable "Notification translate options"'),
			hexpand: true,
		});
		let labelNotificationTranslateOptions = new Gtk.Label({
			label: _("Notification translate options"),
			hexpand: true,
		});
		let labelEnableGlobalTrans = new Gtk.Label({
			label: _("Enable global trans"),
			hexpand: true,
		});
		let labelEnableSelection = new Gtk.Label({
			label: _("Use selection instead of clipboard on notifications and menu (X.org only)"),
			hexpand: true,
		});

		const addRow = ((main) => {
			let row = 0;
			return (label, input) => {
				let inputWidget = input;

				if (label) {
					main.attach(label, 0, row, 1, 1);
					main.attach(inputWidget, 1, row, 1, 1);
				}
				else {
					main.attach(inputWidget, 0, row, 2, 1);
				}

				row++;
			};
		})(this.main);

		addRow(labelTranslateOptions, this.translateOptionsEntry);
		addRow(labelEnableNotificationTransOpt, this.field_enable_notification_trans_opt);
		addRow(labelNotificationTranslateOptions, this.notificationTranslateOptionsEntry);
		addRow(labelEnableGlobalTrans, this.field_enable_global_trans);
		addRow(labelEnableSelection, this.field_enable_selection);
		addRow(null, this.field_keybinding);

		SettingsSchema.bind(Fields.TRANSLATE_OPTIONS, this.translateOptionsEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
		SettingsSchema.bind(Fields.ENABLE_NOTIFICATION_TRANSLATE_OPTIONS, this.field_enable_notification_trans_opt, 'active', Gio.SettingsBindFlags.DEFAULT);
		SettingsSchema.bind(Fields.NOTIFICATION_TRANSLATE_OPTIONS, this.notificationTranslateOptionsEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
		SettingsSchema.bind(Fields.ENABLE_GLOBAL_TRANS, this.field_enable_global_trans, 'active', Gio.SettingsBindFlags.DEFAULT);
		SettingsSchema.bind(Fields.ENABLE_SELECTION, this.field_enable_selection, 'active', Gio.SettingsBindFlags.DEFAULT);
	}
}

//binding widgets
//////////////////////////////////
const COLUMN_ID = 0;
const COLUMN_DESCRIPTION = 1;
const COLUMN_KEY = 2;
const COLUMN_MODS = 3;


function addKeybinding(model, settings, id, description) {
	// Get the current accelerator.
	let accelerator = settings.get_strv(id)[0];
	let key, mods;
	if (accelerator == null)
		[key, mods] = [0, 0];
	else
		[key, mods] = Gtk.accelerator_parse(settings.get_strv(id)[0]);

	// Add a row for the keybinding.
	let row = model.insert(100); // Erm...
	model.set(row,
		[COLUMN_ID, COLUMN_DESCRIPTION, COLUMN_KEY, COLUMN_MODS],
		[id, description, key, mods]);
}

function createKeybindingWidget(SettingsSchema) {
	let model = new Gtk.ListStore();

	model.set_column_types(
		[GObject.TYPE_STRING, // COLUMN_ID
		GObject.TYPE_STRING, // COLUMN_DESCRIPTION
		GObject.TYPE_INT,    // COLUMN_KEY
		GObject.TYPE_INT]);  // COLUMN_MODS

	let treeView = new Gtk.TreeView();
	treeView.model = model;
	treeView.headers_visible = false;

	let column, renderer;

	// Description column.
	renderer = new Gtk.CellRendererText();

	column = new Gtk.TreeViewColumn();
	column.expand = true;
	column.pack_start(renderer, true);
	column.add_attribute(renderer, "text", COLUMN_DESCRIPTION);

	treeView.append_column(column);

	// Key binding column.
	renderer = new Gtk.CellRendererAccel();
	renderer.accel_mode = Gtk.CellRendererAccelMode.GTK;
	renderer.editable = true;

	renderer.connect("accel-edited",
		function(renderer, path, key, mods, hwCode) {
			let [ok, iter] = model.get_iter_from_string(path);
			if (!ok)
				return;

			// Update the UI.
			model.set(iter, [COLUMN_KEY, COLUMN_MODS], [key, mods]);

			// Update the stored setting.
			let id = model.get_value(iter, COLUMN_ID);
			let accelString = Gtk.accelerator_name(key, mods);
			SettingsSchema.set_strv(id, [accelString]);
		});

	renderer.connect("accel-cleared",
		function(renderer, path) {
			let [ok, iter] = model.get_iter_from_string(path);
			if (!ok)
				return;

			// Update the UI.
			model.set(iter, [COLUMN_KEY, COLUMN_MODS], [0, 0]);

			// Update the stored setting.
			let id = model.get_value(iter, COLUMN_ID);
			SettingsSchema.set_strv(id, []);
		});

	column = new Gtk.TreeViewColumn();
	column.pack_end(renderer, false);
	column.add_attribute(renderer, "accel-key", COLUMN_KEY);
	column.add_attribute(renderer, "accel-mods", COLUMN_MODS);

	treeView.append_column(column);

	return treeView;
}
