import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/ui';
import { Actividad } from './pages/Actividad';
import { Configuracion } from './pages/Configuracion';
import { Corrida } from './pages/Corrida';
import { DetalleProspecto } from './pages/DetalleProspecto';
import { Directorio } from './pages/Directorio';
import { Embudo } from './pages/Embudo';
import { Inicio } from './pages/Inicio';
import { Oficina } from './pages/Oficina';
import { Prospectos } from './pages/Prospectos';

function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] p-8">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/prospectos" element={<Prospectos />} />
            <Route path="/prospectos/:id" element={<DetalleProspecto />} />
            <Route path="/embudo" element={<Embudo />} />
            <Route path="/directorio" element={<Directorio />} />
            <Route path="/oficina" element={<Oficina />} />
            <Route path="/corrida" element={<Corrida />} />
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
