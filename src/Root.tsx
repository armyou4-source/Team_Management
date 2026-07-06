import { StrictMode } from 'react';
import App from './App.tsx';
import AccidentReportPage from './AccidentReportPage.tsx';

export const isAccidentReportPath = (pathname: string): boolean =>
  /^\/report\/?$/i.test(pathname);

export default function Root() {
  const isReportRoute = isAccidentReportPath(window.location.pathname);

  return (
    <StrictMode>
      {isReportRoute ? <AccidentReportPage /> : <App />}
    </StrictMode>
  );
}
