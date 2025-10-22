import React, { useState, useRef, useEffect } from 'react';
import './DocumentScanner.css';
import { Camera, FileText, CreditCard, Check, X, RotateCcw, Download, Plus, Trash2, Crop } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const DocumentScanner = () => {
  const [mode, setMode] = useState('home'); // home, dni, document
  const [dniStep, setDniStep] = useState('front'); // front, back, preview
  const [capturedImages, setCapturedImages] = useState([]);
  const [dniImages, setDniImages] = useState({ front: null, back: null });
  const [stream, setStream] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [currentCrop, setCurrentCrop] = useState({ type: null, index: null, src: null });
  const [cropPoints, setCropPoints] = useState({ x: 40, y: 40, width: 300, height: 400 });
  const cropDragRef = useRef({ active: false, mode: 'move', startX: 0, startY: 0, start: { x: 0, y: 0, width: 0, height: 0 } });
  const cropStageRef = useRef(null);
  const cropImgRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    try {
      // Stop previous stream if any
      if (stream) {
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = mediaStream;
        await new Promise(resolve => {
          const onMeta = () => { v.play().catch(() => {}); v.removeEventListener('loadedmetadata', onMeta); resolve(); };
          v.addEventListener('loadedmetadata', onMeta);
        });
      }

      if (mode === 'dni') {
        setIsDetecting(true);
        startDNIDetection();
      }
    } catch (err) {
      console.error(err);
      alert('No se pudo acceder a la cámara. Por favor, permite el acceso.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
  };

  const startDNIDetection = () => {
    // Run every ~300ms and require a few consecutive positives
    detectionIntervalRef.current = setInterval(() => {
      detectRectangle();
    }, 300);
  };

  const detectRectangle = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!video.videoWidth || !video.videoHeight) return;

    // Downscale processing for speed
    const targetW = 320;
    const scale = targetW / video.videoWidth;
    const w = Math.max(160, Math.floor(video.videoWidth * scale));
    const h = Math.max(120, Math.floor(video.videoHeight * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const detected = simpleEdgeDetection(imageData);

    detectRectangle._stable = (detectRectangle._stable || 0) + (detected ? 1 : -1);
    if (detectRectangle._stable < 0) detectRectangle._stable = 0;
    if (detectRectangle._stable >= 3) {
      detectRectangle._stable = 0;
      capturePhoto();
    }
  };

  const simpleEdgeDetection = (imageData) => {
    const data = imageData.data;
    let edgeCount = 0;
    const threshold = 40;
    const minEdges = (imageData.width * imageData.height) / 35; // adaptive

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (i + imageData.width * 4 < data.length) {
        const nextBrightness = (data[i + imageData.width * 4] + data[i + imageData.width * 4 + 1] + data[i + imageData.width * 4 + 2]) / 3;
        if (Math.abs(brightness - nextBrightness) > threshold) {
          edgeCount++;
        }
      }
    }

    return edgeCount > minEdges;
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageUrl = canvas.toDataURL('image/jpeg', 0.9);

    if (mode === 'dni') {
      setIsDetecting(false);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }

      if (dniStep === 'front') {
        setDniImages(prev => ({ ...prev, front: imageUrl }));
        stopCamera();
        setTimeout(() => {
          setDniStep('back');
          startCamera();
        }, 500);
      } else if (dniStep === 'back') {
        setDniImages(prev => ({ ...prev, back: imageUrl }));
        stopCamera();
        setDniStep('preview');
      }
    } else if (mode === 'document') {
      setCapturedImages(prev => [...prev, imageUrl]);
      stopCamera();
    }
  };

  const manualCapture = () => {
    capturePhoto();
  };

  const retakeDNI = (side) => {
    if (side === 'front') {
      setDniImages(prev => ({ ...prev, front: null }));
      setDniStep('front');
      startCamera();
    } else {
      setDniImages(prev => ({ ...prev, back: null }));
      setDniStep('back');
      startCamera();
    }
  };

  const dataURLToUint8Array = (dataURL) => {
    const base64 = dataURL.split(',')[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const saveDNI = async () => {
    try {
      const pdfDoc = await PDFDocument.create();
      for (const img of [dniImages.front, dniImages.back]) {
        if (!img) continue;
        const bytes = dataURLToUint8Array(img);
        const embedded = img.startsWith('data:image/png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage();
        const { width: pw, height: ph } = page.getSize();
        const iw = embedded.width, ih = embedded.height;
        const margin = 36;
        const scale = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih);
        const w = iw * scale, h = ih * scale;
        const x = (pw - w) / 2, y = (ph - h) / 2;
        page.drawImage(embedded, { x, y, width: w, height: h });
      }
      const bytesOut = await pdfDoc.save();
      downloadBlob(new Blob([bytesOut], { type: 'application/pdf' }), 'DNI.pdf');
      resetApp();
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el PDF del DNI');
    }
  };

  const downloadPDF = async () => {
    if (capturedImages.length === 0) {
      alert('No hay páginas para guardar');
      return;
    }
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      for (let i = 0; i < capturedImages.length; i++) {
        const imgUrl = capturedImages[i];
        const bytes = dataURLToUint8Array(imgUrl);
        const embedded = imgUrl.startsWith('data:image/png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage();
        const { width: pw, height: ph } = page.getSize();
        const iw = embedded.width, ih = embedded.height;
        const margin = 36;
        const maxW = pw - margin * 2;
        const maxH = ph - margin * 2;
        const scale = Math.min(maxW / iw, maxH / ih);
        const w = iw * scale, h = ih * scale;
        const x = (pw - w) / 2, y = (ph - h) / 2;
        page.drawImage(embedded, { x, y, width: w, height: h });
        page.drawText(`${i + 1}/${capturedImages.length}`, { x: pw - 72, y: 16, size: 10, font, color: rgb(0.4,0.4,0.4) });
      }
      const bytesOut = await pdfDoc.save();
      downloadBlob(new Blob([bytesOut], { type: 'application/pdf' }), 'Documento.pdf');
      resetApp();
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el PDF');
    }
  };

  const deleteImage = (index) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const openCropMode = (type, index, src) => {
    setCurrentCrop({ type, index, src });
    setCropPoints({ x: 40, y: 40, width: 300, height: 400 });
    setCropMode(true);
  };

  const applyCrop = () => {
    if (!currentCrop.src) { setCropMode(false); return; }
    const stage = cropStageRef.current;
    const imgEl = cropImgRef.current;
    if (!stage || !imgEl) { setCropMode(false); return; }

    const stageRect = stage.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();

    // Compute crop rectangle relative to the displayed image box
    const cropLeft = cropPoints.x;
    const cropTop = cropPoints.y;
    const cropRight = cropPoints.x + cropPoints.width;
    const cropBottom = cropPoints.y + cropPoints.height;

    // Position of image box inside stage
    const imgLeftInStage = imgRect.left - stageRect.left;
    const imgTopInStage = imgRect.top - stageRect.top;

    // Intersection with image area
    const interLeft = Math.max(cropLeft, imgLeftInStage);
    const interTop = Math.max(cropTop, imgTopInStage);
    const interRight = Math.min(cropRight, imgLeftInStage + imgRect.width);
    const interBottom = Math.min(cropBottom, imgTopInStage + imgRect.height);

    const interW = Math.max(1, interRight - interLeft);
    const interH = Math.max(1, interBottom - interTop);

    // Map displayed pixels to natural pixels
    const relXInImg = interLeft - imgLeftInStage;
    const relYInImg = interTop - imgTopInStage;

    const scaleX = imgEl.naturalWidth / imgRect.width;
    const scaleY = imgEl.naturalHeight / imgRect.height;

    const sx = Math.floor(relXInImg * scaleX);
    const sy = Math.floor(relYInImg * scaleY);
    const sw = Math.floor(interW * scaleX);
    const sh = Math.floor(interH * scaleY);

    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, sw); c.height = Math.max(1, sh);
      const cctx = c.getContext('2d');
      cctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const cropped = c.toDataURL('image/jpeg', 0.92);
      if (currentCrop.type === 'dni-front') {
        setDniImages(prev => ({ ...prev, front: cropped }));
      } else if (currentCrop.type === 'dni-back') {
        setDniImages(prev => ({ ...prev, back: cropped }));
      } else if (currentCrop.type === 'doc') {
        setCapturedImages(prev => prev.map((p, i) => (i === currentCrop.index ? cropped : p)));
      }
      setCropMode(false);
      setCurrentCrop({ type: null, index: null, src: null });
    };
    img.src = currentCrop.src;
  };

  const onCropPointerDown = (e, mode) => {
    const point = e.touches?.[0] || e;
    cropDragRef.current = {
      active: true,
      mode,
      startX: point.clientX,
      startY: point.clientY,
      start: { ...cropPoints },
    };
    window.addEventListener('mousemove', onCropPointerMove);
    window.addEventListener('touchmove', onCropPointerMove, { passive: false });
    window.addEventListener('mouseup', onCropPointerUp);
    window.addEventListener('touchend', onCropPointerUp);
  };

  const onCropPointerMove = (e) => {
    if (!cropDragRef.current.active) return;
    const point = e.touches?.[0] || e;
    if (e.cancelable) e.preventDefault();
    const dx = point.clientX - cropDragRef.current.startX;
    const dy = point.clientY - cropDragRef.current.startY;
    const { start } = cropDragRef.current;
    let rect = { ...start };
    const stageRect = cropStageRef.current?.getBoundingClientRect();
    switch (cropDragRef.current.mode) {
      case 'move':
        rect.x = Math.max(0, start.x + dx);
        rect.y = Math.max(0, start.y + dy);
        break;
      case 'nw':
        rect.x = Math.max(0, start.x + dx);
        rect.y = Math.max(0, start.y + dy);
        rect.width = Math.max(20, start.width - dx);
        rect.height = Math.max(20, start.height - dy);
        break;
      case 'ne':
        rect.y = Math.max(0, start.y + dy);
        rect.width = Math.max(20, start.width + dx);
        rect.height = Math.max(20, start.height - dy);
        break;
      case 'sw':
        rect.x = Math.max(0, start.x + dx);
        rect.width = Math.max(20, start.width - dx);
        rect.height = Math.max(20, start.height + dy);
        break;
      case 'se':
        rect.width = Math.max(20, start.width + dx);
        rect.height = Math.max(20, start.height + dy);
        break;
      default:
        break;
    }
    // Clamp to stage bounds if available
    if (stageRect) {
      rect.x = Math.min(Math.max(0, rect.x), Math.max(0, stageRect.width - rect.width));
      rect.y = Math.min(Math.max(0, rect.y), Math.max(0, stageRect.height - rect.height));
      rect.width = Math.min(rect.width, stageRect.width);
      rect.height = Math.min(rect.height, stageRect.height);
    }
    setCropPoints(rect);
  };

  const onCropPointerUp = () => {
    cropDragRef.current.active = false;
    window.removeEventListener('mousemove', onCropPointerMove);
    window.removeEventListener('touchmove', onCropPointerMove);
    window.removeEventListener('mouseup', onCropPointerUp);
    window.removeEventListener('touchend', onCropPointerUp);
  };

  const resetApp = () => {
    setMode('home');
    setDniStep('front');
    setCapturedImages([]);
    setDniImages({ front: null, back: null });
    setCropMode(false);
    stopCamera();
  };

  // HOME SCREEN
  if (mode === 'home') {
    return (
      <div className="ds-root ds-home">
        <div className="ds-container">
          <div className="ds-header">
            <h1 className="ds-title">📱 Escáner Simple</h1>
            <p className="ds-subtitle">Elige qué quieres escanear</p>
          </div>

          <div className="ds-actions">
            <button
              onClick={() => { setMode('dni'); startCamera(); }}
              className="ds-card ds-card--blue"
            >
              <CreditCard className="ds-icon" />
              <div className="ds-card-title">Escanear DNI</div>
              <div className="ds-card-desc">Frontal y trasero automático</div>
            </button>

            <button
              onClick={() => { setMode('document'); startCamera(); }}
              className="ds-card ds-card--green"
            >
              <FileText className="ds-icon" />
              <div className="ds-card-title">Escanear Documento</div>
              <div className="ds-card-desc">Varias páginas a PDF</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DNI MODE
  if (mode === 'dni') {
    if (dniStep === 'preview') {
      return (
        <div className="ds-root ds-dni-preview">
          <div className="ds-container ds-narrow">
            <h2 className="ds-dni-title">✅ DNI Capturado</h2>

            <div className="ds-dni-list">
              <div className="ds-card-white">
                <h3 className="ds-card-heading">Parte Frontal</h3>
                <img src={dniImages.front} alt="DNI Frontal" className="ds-preview-img" />
                <button onClick={() => retakeDNI('front')} className="ds-btn ds-btn--orange">
                  <RotateCcw className="ds-btn-icon" /> Repetir Foto
                </button>
                <div style={{ height: 8 }} />
                <button onClick={() => openCropMode('dni-front', 0, dniImages.front)} className="ds-btn ds-btn--blue ds-btn-small">
                  <Crop className="ds-btn-icon" /> Ajustar bordes
                </button>
              </div>

              <div className="ds-card-white">
                <h3 className="ds-card-heading">Parte Trasera</h3>
                <img src={dniImages.back} alt="DNI Trasero" className="ds-preview-img" />
                <button onClick={() => retakeDNI('back')} className="ds-btn ds-btn--orange">
                  <RotateCcw className="ds-btn-icon" /> Repetir Foto
                </button>
                <div style={{ height: 8 }} />
                <button onClick={() => openCropMode('dni-back', 0, dniImages.back)} className="ds-btn ds-btn--blue ds-btn-small">
                  <Crop className="ds-btn-icon" /> Ajustar bordes
                </button>
              </div>
            </div>

            <div className="ds-actions-vertical">
              <button onClick={saveDNI} className="ds-btn ds-btn--green ds-btn-large">
                <Download className="ds-btn-icon" /> Guardar DNI
              </button>
              <button onClick={resetApp} className="ds-btn ds-btn--gray ds-btn-large">
                <X className="ds-btn-icon" /> Cancelar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="ds-root ds-capture">
        <div className="ds-video-wrap">
          <video ref={videoRef} autoPlay playsInline muted className="ds-video" />
          <canvas ref={canvasRef} className="ds-canvas" />

          {/* guía visual */}
          <div className="ds-overlay">
            <div className="ds-guide">
              <div className="ds-corner tl" />
              <div className="ds-corner tr" />
              <div className="ds-corner bl" />
              <div className="ds-corner br" />
            </div>
          </div>

          <div className="ds-topbar">
            <h2 className="ds-topbar-title">
              {dniStep === 'front' ? '📄 Coloca la PARTE FRONTAL' : '📄 Coloca la PARTE TRASERA'}
            </h2>
            <p className="ds-topbar-sub">
              {isDetecting ? '🔍 Detectando DNI...' : 'Centra el DNI en el recuadro'}
            </p>
          </div>

          <div className="ds-bottombar">
            <div className="ds-controls">
              <button onClick={manualCapture} className="ds-btn ds-btn--green ds-btn-circle">
                <Camera /> Tomar Foto
              </button>
              <button onClick={resetApp} className="ds-btn ds-btn--red ds-btn-circle">
                <X />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // DOCUMENT MODE
  if (mode === 'document') {
    if (capturedImages.length > 0 && !stream) {
      return (
        <div className="ds-root ds-doc-list">
          <div className="ds-container ds-narrow">
            <h2 className="ds-doc-title">📄 Páginas Capturadas: {capturedImages.length}</h2>

            <div className="ds-doc-pages">
              {capturedImages.map((img, index) => (
                <div key={index} className="ds-card-white ds-page-card">
                  <div className="ds-page-header">
                    <span className="ds-page-number">Página {index + 1}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openCropMode('doc', index, img)} className="ds-btn ds-btn--blue ds-btn-sm">
                        <Crop />
                      </button>
                      <button onClick={() => deleteImage(index)} className="ds-btn ds-btn--red ds-btn-sm">
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                  <img src={img} alt={`Página ${index + 1}`} className="ds-preview-img" />
                </div>
              ))}
            </div>

            <div className="ds-actions-vertical">
              <button onClick={startCamera} className="ds-btn ds-btn--blue ds-btn-large">
                <Plus className="ds-btn-icon" /> Añadir Más Páginas
              </button>
              <button onClick={downloadPDF} className="ds-btn ds-btn--green ds-btn-large">
                <Download className="ds-btn-icon" /> Guardar Documento
              </button>
              <button onClick={resetApp} className="ds-btn ds-btn--gray ds-btn-large">
                <X className="ds-btn-icon" /> Cancelar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="ds-root ds-capture">
        <div className="ds-video-wrap">
          <video ref={videoRef} autoPlay playsInline muted className="ds-video" />
          <canvas ref={canvasRef} className="ds-canvas" />

          <div className="ds-topbar">
            <h2 className="ds-topbar-title">📄 Escanear Documento</h2>
            <p className="ds-topbar-sub">
              {capturedImages.length === 0 ? 'Enfoca la primera página' : `Página ${capturedImages.length + 1}`}
            </p>
          </div>

          <div className="ds-bottombar">
            <div className="ds-controls">
              <button onClick={manualCapture} className="ds-btn ds-btn--green ds-btn-circle">
                <Camera />
              </button>

              {capturedImages.length > 0 && (
                <button onClick={() => stopCamera()} className="ds-btn ds-btn--blue ds-btn-small">
                  <Check className="ds-btn-icon" /> Terminar ({capturedImages.length})
                </button>
              )}

              <button onClick={resetApp} className="ds-btn ds-btn--red ds-btn-circle">
                <X />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Crop overlay
  if (cropMode) {
    return (
      <div className="ds-root ds-capture" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 960, width: '100%', background: '#0b1220', borderRadius: 12, padding: 12 }}>
          <div ref={cropStageRef} style={{ position: 'relative', width: '100%', height: '70vh', background: '#000', touchAction: 'none' }}>
            {/* Background image */}
            {currentCrop.src && (
              <img ref={cropImgRef} src={currentCrop.src} alt="Recortar" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }} />
            )}
            {/* Crop rectangle */}
            <div
              style={{ position: 'absolute', left: cropPoints.x, top: cropPoints.y, width: cropPoints.width, height: cropPoints.height, border: '2px solid #22c55e', boxShadow: '0 0 0 9999px rgba(34,197,94,0.15) inset', cursor: 'move' }}
              onMouseDown={(e) => onCropPointerDown(e, 'move')}
              onTouchStart={(e) => onCropPointerDown(e, 'move')}
            >
              {/* Handles */}
              <div style={{ position: 'absolute', width: 16, height: 16, background: '#22c55e', left: -8, top: -8, cursor: 'nwse-resize' }} onMouseDown={(e) => onCropPointerDown(e, 'nw')} onTouchStart={(e) => onCropPointerDown(e, 'nw')} />
              <div style={{ position: 'absolute', width: 16, height: 16, background: '#22c55e', right: -8, top: -8, cursor: 'nesw-resize' }} onMouseDown={(e) => onCropPointerDown(e, 'ne')} onTouchStart={(e) => onCropPointerDown(e, 'ne')} />
              <div style={{ position: 'absolute', width: 16, height: 16, background: '#22c55e', left: -8, bottom: -8, cursor: 'nesw-resize' }} onMouseDown={(e) => onCropPointerDown(e, 'sw')} onTouchStart={(e) => onCropPointerDown(e, 'sw')} />
              <div style={{ position: 'absolute', width: 16, height: 16, background: '#22c55e', right: -8, bottom: -8, cursor: 'nwse-resize' }} onMouseDown={(e) => onCropPointerDown(e, 'se')} onTouchStart={(e) => onCropPointerDown(e, 'se')} />
            </div>
          </div>

          <div className="ds-bottombar" style={{ position: 'static', background: 'none', padding: '12px 0', display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button className="ds-btn ds-btn--green ds-btn-large" onClick={applyCrop}><Check className="ds-btn-icon" /> Aplicar</button>
            <button className="ds-btn ds-btn--gray ds-btn-large" onClick={() => { setCropMode(false); setCurrentCrop({ type: null, index: null, src: null }); }}><X className="ds-btn-icon" /> Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default DocumentScanner;
