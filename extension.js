import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

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
        const osd = `${base}.osd`;

        // Wayland-safe screenshot (user selects area)
        this._exec(['gnome-screenshot', '-a', '-f', img], () => {

            if (!GLib.file_test(img, GLib.FileTest.EXISTS)) {
                // user canceled selection
                return;
            }

            // Improve image quality
            this._exec([
                'mogrify',
                '-modulate', '100,0',
                '-resize', '400%',
                img
            ], () => {

                // Detect language / script
                this._exec([
                    'tesseract',
                    img,
                    osd,
                    '-l', 'osd'
                ], () => {

                    const lang = this._detectLanguage(`${osd}.txt`) ?? 'eng';

                    // Final OCR pass
                    this._exec([
                        'tesseract',
                        img,
                        base,
                        '-l', lang
                    ], () => {

                        const text = this._readFile(txt);
                        if (!text) return;

                        this._copyToClipboard(text);
                        this._notify(text);

                        // Cleanup
                        this._exec(['rm', '-f', img, txt, `${osd}.txt`]);
                    });
                });
            });
        });
    }

    _detectLanguage(osdFile) {
        const content = this._readFile(osdFile);
        if (!content) return null;

        // Example: "Script: Latin"
        if (content.includes('Latin')) return 'eng';
        if (content.includes('Cyrillic')) return 'rus';
        if (content.includes('Han')) return 'chi_sim';
        if (content.includes('Hangul')) return 'kor';
        if (content.includes('Arabic')) return 'ara';

        return null;
    }

    _readFile(path) {
        try {
            const [ok, bytes] = GLib.file_get_contents(path);
            return ok ? bytes.toString().trim() : null;
        } catch {
            return null;
        }
    }

    _copyToClipboard(text) {
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    }

    _notify(text) {
        const truncated =
            text.length > 200 ? text.slice(0, 200) + '…' : text;

        const source = new MessageTray.Source(
            'Screen OCR',
            'accessories-text-editor-symbolic'
        );

        Main.messageTray.add(source);

        const notification = new MessageTray.Notification(
            source,
            'OCR copied to clipboard',
            truncated
        );

        notification.setTransient(true);
        source.showNotification(notification);
    }

    _exec(argv, callback) {
        try {
            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.NONE
            );
            proc.wait_async(null, () => callback?.());
        } catch (e) {
            logError(e);
        }
    }
}
