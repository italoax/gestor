import { criarCatalogoRouter } from './catalogFactory.js';
const APLICATIVOS_PADRAO = [
  ['EasyTV', 'Aplicativo de streaming EasyTV'],
  ['Funplay', 'Aplicativo de streaming Funplay'],
  ['GSE Smart IPTV', 'GSE Smart IPTV Player'],
  ['IptvSmarters', 'IPTV Smarters Player'],
  ['MegaPlay', 'Aplicativo de streaming MegaPlay'],
  ['TiviMate', 'TiviMate IPTV Player'],
];
export const aplicativosRouter = criarCatalogoRouter({
  singular: 'aplicativo',
  plural: 'aplicativos',
  titulo: 'Aplicativos',
  subtitulo: 'Gerencie o catálogo de aplicativos e seus valores de renovação',
  padroes: APLICATIVOS_PADRAO,
  comValorRenovacao: true,
});
