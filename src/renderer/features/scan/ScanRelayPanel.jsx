import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

import { desktopApi } from '../../lib/desktop-api';

const KNOWN_ITEM_FIELDS = ['name', 'brand', 'specification', 'quantity', 'notes', 'categoryId', 'locationId'];

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function buildScanPatch(scanResult, knownItem, draft) {
  const barcode = toText(scanResult?.barcode || scanResult?.rawText);
  const patch = {
    barcode,
    code: barcode
  };

  if (!knownItem) {
    return patch;
  }

  for (const field of KNOWN_ITEM_FIELDS) {
    if (!toText(draft?.[field]) && knownItem[field]) {
      patch[field] = knownItem[field];
    }
  }

  return patch;
}

function buildPhotoPatch(scanResult) {
  const patch = {
    rawText: toText(scanResult?.rawText)
  };

  if (scanResult?.photo?.dataUrl) {
    patch.imageUpload = {
      dataUrl: scanResult.photo.dataUrl,
      mimeType: scanResult.photo.mimeType || 'image/webp',
      fileName: scanResult.photo.fileName || 'capture.webp',
      size: Number(scanResult.photo.size || 0)
    };
  }

  return patch;
}

export default function ScanRelayPanel({ draft, onApplyResult }) {
  const [session, setSession] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [mobileUrl, setMobileUrl] = useState('');
  const [status, setStatus] = useState('');
  const eventSourceRef = useRef(null);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
    },
    []
  );

  async function startScanSession() {
    eventSourceRef.current?.close();
    setStatus('正在创建拍照会话...');

    try {
      const nextSession = await desktopApi.createScanSession();
      const nextMobileUrl = nextSession.mobileUrl || desktopApi.getMobileScanUrl(nextSession.id);
      const nextQrCodeUrl = await QRCode.toDataURL(nextMobileUrl, {
        width: 220,
        margin: 1
      });

      setSession(nextSession);
      setMobileUrl(nextMobileUrl);
      setQrCodeUrl(nextQrCodeUrl);
      setStatus('用手机扫描二维码，然后拍物品照片。');

      if (typeof EventSource === 'undefined') {
        setStatus('当前浏览器不支持实时监听，请刷新后重试。');
        return;
      }

      const source = new EventSource(desktopApi.getScanSessionEventsUrl(nextSession.id));
      eventSourceRef.current = source;

      source.addEventListener('scan-result', async (event) => {
        const payload = JSON.parse(event.data);

        if (payload.photo) {
          setStatus('已收到手机照片。');
          onApplyResult?.(buildPhotoPatch(payload));
          setStatus(payload.rawText ? '已收到照片和文字，已尝试补全表单。' : '已收到照片，请在电脑上补全信息。');
          return;
        }

        setStatus(`已收到条码：${payload.barcode}`);

        const lookup = await desktopApi.lookupBarcode(payload.barcode).catch(() => ({ item: null }));
        onApplyResult?.(buildScanPatch(payload, lookup.item, draft));
        setStatus(lookup.item ? '已用历史物品信息补全表单。' : '已填入条码，请在电脑上补全信息。');
      });
    } catch (error) {
      setStatus(error?.message || '拍照会话创建失败');
    }
  }

  return (
    <div className="scan-relay-panel">
      <div className="scan-relay-panel__header">
        <div>
          <strong>手机拍照</strong>
          <span>手机负责拍照，电脑负责填表和上传。</span>
        </div>
        <button className="secondary-button" type="button" onClick={startScanSession}>
          手机拍照
        </button>
      </div>

      {qrCodeUrl ? (
        <div className="scan-relay-panel__session">
          <img src={qrCodeUrl} alt="手机拍照二维码" />
          <div>
            <p>{status}</p>
            <a href={mobileUrl} target="_blank" rel="noreferrer">
              打开手机拍照页
            </a>
          </div>
        </div>
      ) : status ? (
        <p className="scan-relay-panel__status">{status}</p>
      ) : null}

      {session ? <span className="scan-relay-panel__session-id">会话：{session.id}</span> : null}
    </div>
  );
}
