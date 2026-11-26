import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/ui';
import { Actividad } from './pages/Actividad';
import { Aprendizaje } from './pages/Aprendizaje';
import { Biblioteca } from './pages/Biblioteca';
import { Configuracion } from './pages/Configuracion';
import { DetalleProspecto } from './pages/DetalleProspecto';
import { Directorio } from './pages/Directorio';
import { Embudo } from './pages/Embudo';
import { Habilidades } from './pages/Habilidades';
import { Edificio } from './pages/Edificio';
import { CorridaSegunOficina, InicioSegunOficina, SoloProspeccion } from './pages/PorOficina';
import { Oficina } from './oficina3d/Oficina3D';
import { useOficinaActiva } from './lib/oficinaActiva';
import { Prompts } from './pages/Prompts';
import { Prospectos } from './pages/Prospectos';
import { Salidas } from './pages/Salidas';

/** Cambiar de piso reinicia la pantalla 3D (estado vivo y escena propios de cada oficina). */
function OficinaDelPiso() {
  return <Oficina key={useOficinaActiva()} />;
}

function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] p-8">
          <Routes>
            <Route path="/" element={<InicioSegunOficina />} />
            <Route path="/edificio" element={<Edificio />} />
            <Route
              path="/prospectos"
              element={
                <SoloProspeccion>
                  <Prospectos />
                </SoloProspeccion>
              }
            />
            <Route
              path="/prospectos/:id"
              element={
                <SoloProspeccion>
                  <DetalleProspecto />
                </SoloProspeccion>
              }
            />
            <Route
              path="/embudo"
              element={
                <SoloProspeccion>
                  <Embudo />
                </SoloProspeccion>
              }
            />
            <Route
              path="/directorio"
              element={
                <SoloProspeccion>
                  <Directorio />
                </SoloProspeccion>
              }
            />
            <Route path="/oficina" element={<OficinaDelPiso />} />
            <Route path="/corrida" element={<CorridaSegunOficina />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/habilidades" element={<Habilidades />} />
            <Route path="/aprendizaje" element={<Aprendizaje />} />
            <Route path="/salidas" element={<Salidas />} />
            <Route path="/actividad" element={<Actividad />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="*" element={<p className="text-muted">Esta página no existe.</p>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Layout />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
