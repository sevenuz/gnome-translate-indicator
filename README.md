# gnome-translate-indicator

Translate extension for Gnome-Shell - 
based on (https://github.com/soimort/translate-shell)[translate-shell],

Menu to translate everthing on your desktop.

`<Super> + T` to toggle menu.

`<Cntl> + <Cntl> + T` to use notification translation.

Shortcuts can be changed in the settings.

On X.org, you can translate selected text. 
This can be enabled in the settings.
This is not supported on wayland.
There, you have to copy the clipboard for translation.

A simple translation tool for the GNOME desktop.
It can be installed over
https://extensions.gnome.org/extension/3318/translate-indicator/

By default, this extension uses the included translate-shell version,
which is probalbly not the newest. You can change this in the settings.

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

Heavily inspired by (https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator)[Tudmotu's clipboard-indicator] 
and (https://github.com/gufoe/text-translator)[gufoe's text-translator]
