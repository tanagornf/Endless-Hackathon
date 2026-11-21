import { Navigate } from 'react-router-dom';

export default function TeamRedirect() {
  return <Navigate to="/chat" replace />;
}
