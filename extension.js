import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ScreenOCRExtension extends Extension {
    enable() {
        this._button = new St.Button({
            style_class: 'panel-button',
            reactive: true,
            can_focus: true,
            label: 'OCR'
        });

        this._button.connect('button-press-event', () => {
            this._runOCR();
        });

        Main.panel.addToStatusArea(this.uuid, this._button);
    }

    disable() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
    }

    _runOCR() {
        const tmpDir = GLib.get_tmp_dir();
        const base = `${tmpDir}/screen-ocr-${Date.now()}`;
        const img = `${base}.png`;
        const txt = `${base}.txt`;

        // Step 1: Area screenshot
        this._exec([
            'gnome-screenshot', '-a', '-f', img
        ], () => {

            // Step 2: Improve image
            this._exec([
                'mogrify',
                '-modulate', '100,0',
                '-resize', '400%',
                img
            ], () => {

                // Step 3: OCR
                this._exec([
                    'tesseract',
                    img,
                    base
                ], () => {

                    // Step 4: Copy to clipboard
                    this._copyToClipboard(txt);

                    // Cleanup
                    this._exec(['rm', '-f', img, txt]);
                });
            });
        });
    }

    _exec(argv, callback) {
        try {
            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.NONE
            );

            proc.wait_async(null, () => {
                callback?.();
            });
        } catch (e) {
            logError(e);
        }
    }

    _copyToClipboard(file) {
        const contents = GLib.file_get_contents(file);
        if (!contents[0]) return;

        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, contents[1].toString());
    }
}
