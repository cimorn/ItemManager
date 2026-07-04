import { useEffect, useState } from 'react';

import { compressImageFileToWebp } from './photo-utils';

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export default function MobileScanPage({ sessionId }) {
  const [rawText, setRawText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [status, setStatus] = useState('正在连接拍照会话...');
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connectSession() {
      try {
        await requestJson(`/api/scan-sessions/${encodeURIComponent(sessionId)}`);

        if (!cancelled) {
          setStatus('可以拍照或选择图片。');
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error?.message || '拍照会话不可用，请重新打开二维码。');
        }
      }
    }

    connectSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setCompressing(true);
    setStatus('正在压缩成 WebP...');

    try {
      const compressed = await compressImageFileToWebp(file);
      setPhoto(compressed);
      setStatus('照片已压缩，可以发送到电脑。');
    } catch (error) {
      setPhoto(null);
      setStatus(error?.message || '图片压缩失败，请换一张照片。');
    } finally {
      setCompressing(false);
    }
  }

  async function submitCapture() {
    if (!photo && !rawText.trim()) {
      setStatus('请先拍照，或填写包装文字。');
      return;
    }

    setSubmitting(true);
    setStatus('正在发送到电脑页面...');

    try {
      await requestJson(`/api/scan-sessions/${encodeURIComponent(sessionId)}/results`, {
        method: 'POST',
        body: JSON.stringify({
          rawText: rawText.trim(),
          format: 'photo',
          photo
        })
      });

      setStatus('已发送到电脑页面。');
    } catch (error) {
      setStatus(error?.message || '发送失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mobile-scan-page">
      <section className="mobile-scan-card">
        <h1>手机拍照采集器</h1>
        <p>{status}</p>

        {photo ? (
          <div className="mobile-scan-video-shell">
            <img src={photo.dataUrl} alt="已压缩照片预览" />
          </div>
        ) : (
          <div className="mobile-scan-video-shell">
            <span>等待照片</span>
          </div>
        )}

        <form
          className="mobile-scan-manual"
          onSubmit={(event) => {
            event.preventDefault();
            submitCapture();
          }}
        >
          <div className="mobile-photo-inputs">
            <label className="field">
              <span>拍照</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
            </label>
            <label className="field">
              <span>选择图库</span>
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
          </div>
          <label className="field">
            <span>包装文字</span>
            <textarea
              rows={4}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="可以粘贴或输入包装上的长文字，例如：名称、品牌、规格、数量、位置"
            />
          </label>
          <button className="primary-button" type="submit" disabled={compressing || submitting}>
            {compressing ? '压缩中...' : submitting ? '发送中...' : '发送到电脑'}
          </button>
        </form>
      </section>
    </main>
  );
}
