function renderMobileCapturePage(sessionId) {
  const encodedSessionId = JSON.stringify(String(sessionId || ''));

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>物品拍照</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #edf4f5; color: #13242a; }
      main { width: min(100%, 540px); margin: 0 auto; padding: 18px 16px max(24px, env(safe-area-inset-bottom)); }
      header { margin-bottom: 14px; }
      h1 { margin: 0 0 6px; font-size: 24px; }
      p { margin: 0; color: #60737b; line-height: 1.55; }
      .preview { display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid #cbd9dc; border-radius: 8px; background: #fff; }
      .preview img { width: 100%; height: 100%; object-fit: contain; }
      .preview span { color: #7b8b91; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      button { min-height: 48px; border: 1px solid #c5d2d5; border-radius: 8px; background: #fff; color: #183038; font: inherit; font-weight: 700; }
      button.primary { border-color: #087f78; background: #087f78; color: #fff; }
      button:disabled { opacity: .45; }
      #sendButton { grid-column: 1 / -1; }
      #status { min-height: 25px; margin-top: 12px; font-weight: 600; color: #32646a; }
      input { display: none; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>物品拍照</h1>
        <p>拍好后先发送到电脑，电脑保存物品时才会写入文件。</p>
      </header>
      <div class="preview">
        <img id="previewImage" alt="照片预览" hidden />
        <span id="emptyPreview">等待拍照</span>
      </div>
      <input id="photoInput" type="file" accept="image/*" capture="environment" />
      <div class="actions">
        <button id="captureButton" class="primary" type="button">拍照</button>
        <button id="retakeButton" type="button" disabled>重拍</button>
        <button id="sendButton" class="primary" type="button" disabled>发送到电脑</button>
      </div>
      <p id="status" role="status">准备就绪</p>
    </main>
    <script>
      const sessionId = ${encodedSessionId};
      const photoInput = document.getElementById('photoInput');
      const captureButton = document.getElementById('captureButton');
      const retakeButton = document.getElementById('retakeButton');
      const sendButton = document.getElementById('sendButton');
      const previewImage = document.getElementById('previewImage');
      const emptyPreview = document.getElementById('emptyPreview');
      const status = document.getElementById('status');
      let pendingPhoto = null;

      function setStatus(message) {
        status.textContent = message;
      }

      function openCamera() {
        photoInput.value = '';
        photoInput.click();
      }

      function readBlobAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('照片读取失败'));
          reader.readAsDataURL(blob);
        });
      }

      function loadImage(file) {
        const objectUrl = URL.createObjectURL(file);
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ image, objectUrl });
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('照片解码失败'));
          };
          image.src = objectUrl;
        });
      }

      function canvasToWebp(canvas) {
        return new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('照片压缩失败'));
          }, 'image/webp', 0.78);
        });
      }

      async function preparePhoto(file) {
        setStatus('正在处理照片...');
        const loaded = await loadImage(file);

        try {
          const width = loaded.image.naturalWidth || loaded.image.width;
          const height = loaded.image.naturalHeight || loaded.image.height;
          const ratio = Math.min(1, 1600 / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * ratio));
          canvas.height = Math.max(1, Math.round(height * ratio));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('当前手机无法处理照片');
          context.drawImage(loaded.image, 0, 0, canvas.width, canvas.height);
          const blob = await canvasToWebp(canvas);
          const dataUrl = await readBlobAsDataUrl(blob);
          pendingPhoto = { dataUrl, mimeType: 'image/webp', size: blob.size };
          previewImage.src = dataUrl;
          previewImage.hidden = false;
          emptyPreview.hidden = true;
          retakeButton.disabled = false;
          sendButton.disabled = false;
          setStatus('照片已准备好');
        } finally {
          URL.revokeObjectURL(loaded.objectUrl);
        }
      }

      async function sendPhoto() {
        if (!pendingPhoto) return;
        captureButton.disabled = true;
        retakeButton.disabled = true;
        sendButton.disabled = true;
        setStatus('正在发送到电脑...');

        try {
          const response = await fetch('/api/photo-capture/' + encodeURIComponent(sessionId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingPhoto)
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || '发送失败');
          setStatus('已发送到电脑，可以继续重拍或关闭页面');
        } catch (error) {
          setStatus(error.message || '发送失败，请重试');
        } finally {
          captureButton.disabled = false;
          retakeButton.disabled = false;
          sendButton.disabled = false;
        }
      }

      captureButton.addEventListener('click', openCamera);
      retakeButton.addEventListener('click', openCamera);
      sendButton.addEventListener('click', sendPhoto);
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files && photoInput.files[0];
        if (!file) return;
        try {
          await preparePhoto(file);
        } catch (error) {
          pendingPhoto = null;
          sendButton.disabled = true;
          setStatus(error.message || '照片处理失败，请重拍');
        }
      });
    </script>
  </body>
</html>`;
}

module.exports = { renderMobileCapturePage };
