import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
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
  
  // --- CROP STATE ---
  const [cropMode, setCropMode] = useState(false);
  const [currentCrop, setCurrentCrop] = useState({ type: null, index: null, src: null });
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  // --- END CROP STATE ---

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setStream(null);
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
  }, [stream]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    // Make sure to stop any existing stream before starting a new one.
    stopCamera(); 
    try {
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

  const stopCameraAndClear = () => {
    stopCamera();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

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
        stopCameraAndClear();
        setTimeout(() => {
          setDniStep('back');
        }, 100); // Short delay before showing next step
      } else if (dniStep === 'back') {
        setDniImages(prev => ({ ...prev, back: imageUrl }));
        stopCameraAndClear();
        setDniStep('preview');
      }
    } else if (mode === 'document') {
      setCapturedImages(prev => [...prev, imageUrl]);
      stopCameraAndClear();
    }
  };

  const manualCapture = () => {
    capturePhoto();
  };

  const retakeDNI = (side) => {
    if (side === 'front') {
      setDniImages(prev => ({ ...prev, front: null }));
      setDniStep('front');
    } else {
      setDniImages(prev => ({ ...prev, back: null }));
      setDniStep('back');
    }
  };

  useEffect(() => {
    if (mode === 'dni' && (dniStep === 'front' || dniStep === 'back') && !dniImages[dniStep]) {
      startCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dniStep, dniImages.front, dniImages.back]);


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
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropMode(true);
  };

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous'); // needed to avoid cross-origin issues
      image.src = url;
    });

  const getCroppedImg = async (imageSrc, pixelCrop) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  const applyCrop = async () => {
    if (!croppedAreaPixels || !currentCrop.src) {
      setCropMode(false);
      return;
    }
    try {
      const croppedImageUrl = await getCroppedImg(currentCrop.src, croppedAreaPixels);
      if (currentCrop.type === 'dni-front') {
        setDniImages(prev => ({ ...prev, front: croppedImageUrl }));
      } else if (currentCrop.type === 'dni-back') {
        setDniImages(prev => ({ ...prev, back: croppedImageUrl }));
      } else if (currentCrop.type === 'doc') {
        setCapturedImages(prev => prev.map((p, i) => (i === currentCrop.index ? croppedImageUrl : p)));
      }
      setCropMode(false);
      setCurrentCrop({ type: null, index: null, src: null });
    } catch (e) {
      console.error(e);
      alert('No se pudo recortar la imagen.');
      setCropMode(false);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);


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
      <div className="ds-root ds-cropper-container">
        <div className="ds-cropper-inner">
          <Cropper
            image={currentCrop.src}
            crop={crop}
            zoom={zoom}
            aspect={4 / 5}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="ds-cropper-controls">
           <div className="ds-cropper-zoom">
             <label>Zoom</label>
             <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(e.target.value)}
              className="zoom-range"
            />
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
