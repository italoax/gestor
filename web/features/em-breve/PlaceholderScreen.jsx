'use client';
import Link from 'next/link';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
export function PlaceholderScreen({ data }) {
  return (
    <NativePanel data={data} path={data.path}>
      <div className="container" data-react-page="em-breve">
        <div className="empty-state">
          <div className="empty-state-icon">{data.recurso.icon}</div>
          <h2>{data.recurso.titulo}</h2>
          <span className="empty-badge">Em breve</span>
          <p className="muted">{data.recurso.descricao}</p>
          <Link className="btn btn-primary" href="/dashboard">
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </NativePanel>
  );
}
