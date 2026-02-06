import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

let indicator;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {

        _init() {
            super._init(0.0, 'Screen OCR');

            // Panel icon
            this._label = new St.Label({
                text: '👓',
                y_align: Clutter.ActorAlign.CENTER,
            });

            const box = new St.BoxLayout();
            box.add_child(this._label);
            this.add_child(box);

            // Menu item
            const item = new PopupMenu.PopupMenuItem('Copy text from screen');
            item.connect('activate', () => this._runOCR());
            this.menu.addMenuItem(item);
        }

        _runOCR() {
            const tmpDir = GLib.get_tmp_dir();
            const base = `${tmpDir}/screen-ocr-${Date.now()}`;
            const img = `${base}.png`;
            const txt = `${base}.txt`;
            const osd = `${base}.osd`;

            // Wayland-safe screenshot
            this._exec(['gnome-screenshot', '-a', '-f', img], () => {
                if (!GLib.file_test(img, GLib.FileTest.EXISTS))
                    return;

                this._exec([
                    'mogrify',
                    '-modulate', '100,0',
                    '-resize', '400%',
                    img
                ], () => {

                    this._exec([
                        'tesseract',
                        img,
                        osd,
                        '-l', 'osd'
                    ], () => {

                        const lang = this._detectLanguage(`${osd}.txt`) ?? 'eng';

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

                            this._exec(['rm', '-f', img, txt, `${osd}.txt`]);
                        });
                    });
                });
            });
        }

        _detectLanguage(osdFile) {
            const content = this._readFile(osdFile);
            if (!content) return null;

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
            St.Clipboard.get_default()
                .set_text(St.ClipboardType.CLIPBOARD, text);
        }

        _notify(text) {
            const body = text.length > 200
                ? text.slice(0, 200) + '…'
                : text;

            const source = new MessageTray.Source(
                'Screen OCR',
                'accessories-text-editor-symbolic'
            );

            Main.messageTray.add(source);

            const notification = new MessageTray.Notification(
                source,
                'Text copied to clipboard',
                body
            );

            notification.setTransient(true);
            source.showNotification(notification);
        }

        _exec(argv, callback) {
            try {
                const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
                proc.wait_async(null, () => callback?.());
            } catch (e) {
                logError(e);
            }
        }
    });

export default class ScreenOCRExtension extends Extension {

    enable() {
        indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, indicator);
    }

    disable() {
        if (indicator) {
            indicator.destroy();
            indicator = null;
        }
    }
}