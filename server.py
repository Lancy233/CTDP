import json
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(ROOT_DIR, 'data.json')


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, obj, status=200):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/api/load'):
            if os.path.exists(DATA_PATH):
                try:
                    with open(DATA_PATH, 'r', encoding='utf-8') as f:
                        obj = json.load(f)
                    # 校验结构
                    if not isinstance(obj, dict):
                        obj = {'main': [], 'sub': []}
                    obj.setdefault('main', [])
                    obj.setdefault('sub', [])
                    return self._send_json(obj)
                except Exception as e:
                    return self._send_json({'error': str(e)}, status=500)
            else:
                # 首次访问时自动创建空数据文件
                try:
                    with open(DATA_PATH, 'w', encoding='utf-8') as f:
                        json.dump({'main': [], 'sub': []}, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
                return self._send_json({'main': [], 'sub': []})
        elif self.path.startswith('/api/health'):
            return self._send_json({'ok': True})
        else:
            return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/save'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                obj = json.loads(raw.decode('utf-8'))
                main = obj.get('main', [])
                sub = obj.get('sub', [])
                if not isinstance(main, list) or not isinstance(sub, list):
                    return self._send_json({'error': 'invalid payload'}, status=400)
                with open(DATA_PATH, 'w', encoding='utf-8') as f:
                    json.dump({'main': main, 'sub': sub}, f, ensure_ascii=False, indent=2)
                return self._send_json({'ok': True, 'path': 'data.json'})
            except Exception as e:
                return self._send_json({'error': str(e)}, status=500)
        else:
            self.send_error(404, 'Not Found')


if __name__ == '__main__':
    os.chdir(ROOT_DIR)
    server = ThreadingHTTPServer(('0.0.0.0', 8000), Handler)
    print('Serving at http://localhost:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()