# gnome-translate-indicator

[Translate extension for Gnome-Shell](https://extensions.gnome.org/extension/3318/translate-indicator/) - 
based on [translate-shell](https://github.com/soimort/translate-shell),

Menu to translate everything on your desktop.

`<Super> + T` to toggle menu.
`<Cntl> + <Alt> + T` to use notification translation.

Shortcuts can be changed in the settings.

On X.org, you can translate selected text. 
This can be enabled in the settings.
This is not supported on wayland.
There, you have to copy the clipboard for translation.

By default, this extension uses the included translate-shell version, 
which is probably not the newest. You can change this in the settings.

If you use the the included trans file, make sure that it is executable.
You find the source of the extension usually here: 

`~/.local/share/gnome-shell/extensions/translate-indicator@athenstaedt.net`

else:

```
  press:    alt + f2
  execute:  lg
  click:    extensions
  click:    view source
```

Enable it from terminal by running the following command:

    $ gnome-extensions enable translate-indicator@athenstaedt.net


# Acknowledgments

Heavily inspired by [Tudmotu's clipboard-indicator](https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator) 
and [gufoe's text-translator](https://github.com/gufoe/text-translator)
