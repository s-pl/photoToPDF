import React, { useState, useRef, useEffect } from 'react';
import './DocumentScanner.css';
import { Camera, FileText, CreditCard, Check, X, RotateCcw, Download, Plus, Trash2 } from 'lucide-react';

const DocumentScanner = () => {
  const [mode, setMode] = useState('home'); // home, dni, document
  const [dniStep, setDniStep] = useState('front'); // front, back, preview
  const [capturedImages, setCapturedImages] = useState([]);
  const [dniImages, setDniImages] = useState({ front: null, back: null });
  const [stream, setStream] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [currentCropImage, setCurrentCropImage] = useState(null);
  const [cropPoints, setCropPoints] = useState({ x: 50, y: 50, width: 300, height: 400 });

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
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      if (mode === 'dni') {
        setIsDetecting(true);
        startDNIDetection();
      }
    } catch (err) {
      alert('No se pudo acceder a la cámara. Por favor, permite el acceso.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
  };

  const startDNIDetection = () => {
    detectionIntervalRef.current = setInterval(() => {
      detectRectangle();
    }, 500);
  };

  const detectRectangle = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const detected = simpleEdgeDetection(imageData);

    if (detected) {
      capturePhoto();
    }
  };

  const simpleEdgeDetection = (imageData) => {
    const data = imageData.data;
    let edgeCount = 0;
    const threshold = 50;
    const minEdges = 1000;

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

  const saveDNI = () => {
    const link = document.createElement('a');
    link.download = 'dni-frontal.jpg';
    link.href = dniImages.front;
    link.click();

    setTimeout(() => {
      const link2 = document.createElement('a');
      link2.download = 'dni-trasero.jpg';
      link2.href = dniImages.back;
      link2.click();
    }, 500);

    alert('¡DNI guardado! Las dos fotos se han descargado.');
    resetApp();
  };

  const downloadPDF = async () => {
    if (capturedImages.length === 0) {
      alert('No hay páginas para guardar');
      return;
    }

    // Por simplicidad descargamos imágenes; en producción usar jsPDF o similar.
    for (let i = 0; i < capturedImages.length; i++) {
      setTimeout(() => {
        const imgLink = document.createElement('a');
        imgLink.download = `documento-pagina-${i + 1}.jpg`;
        imgLink.href = capturedImages[i];
        imgLink.click();
      }, i * 500);
    }

    alert(`¡Documento guardado! Se han descargado ${capturedImages.length} página(s).`);
    resetApp();
  };

  const deleteImage = (index) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const openCropMode = (imageUrl) => {
    setCurrentCropImage(imageUrl);
    setCropMode(true);
  };

  const applyCrop = () => {
    setCropMode(false);
    setCurrentCropImage(null);
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
              </div>

              <div className="ds-card-white">
                <h3 className="ds-card-heading">Parte Trasera</h3>
                <img src={dniImages.back} alt="DNI Trasero" className="ds-preview-img" />
                <button onClick={() => retakeDNI('back')} className="ds-btn ds-btn--orange">
                  <RotateCcw className="ds-btn-icon" /> Repetir Foto
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
          <video ref={videoRef} autoPlay playsInline className="ds-video" />
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
                    <button onClick={() => deleteImage(index)} className="ds-btn ds-btn--red ds-btn-sm">
                      <Trash2 />
                    </button>
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
          <video ref={videoRef} autoPlay playsInline className="ds-video" />
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

  return null;
};

export default DocumentScanner;
