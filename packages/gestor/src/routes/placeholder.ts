import { Router } from "express";

export const placeholderRouter = Router();

const RECURSOS: Record<string, { titulo: string; icon: string; descricao: string }> = {
  testes: { titulo: "Testes", icon: "🧪", descricao: "Crie e acompanhe testes gratuitos para novos clientes." },
  transacoes: { titulo: "Transações", icon: "🧾", descricao: "Extrato completo de entradas e saídas financeiras." },
  integracoes: { titulo: "Integrações", icon: "🔌", descricao: "Conecte Telegram, painéis e outros serviços externos." },
  aplicativos: { titulo: "Aplicativos", icon: "📱", descricao: "Catálogo de aplicativos usados pelos seus clientes." },
  dispositivos: { titulo: "Dispositivos", icon: "💻", descricao: "Controle os dispositivos vinculados a cada cliente." },
  automacao: { titulo: "Automação", icon: "⚡", descricao: "Fluxos automáticos de mensagens e tarefas." },
  "meu-plano": { titulo: "Meu Plano", icon: "📃", descricao: "Detalhes da sua assinatura e limites de uso." },
  indique: { titulo: "Indique e Ganhe", icon: "🎁", descricao: "Indique novos usuários e ganhe recompensas." },
  "integracao-pagamento": { titulo: "Integração Pagamento", icon: "💳", descricao: "Receba pagamentos automáticos via gateway." },
  importar: { titulo: "Importar", icon: "⬆️", descricao: "Importe clientes em massa a partir de planilhas." },
  tutoriais: { titulo: "Tutoriais", icon: "▶️", descricao: "Vídeos e guias para tirar o máximo do sistema." },
};

placeholderRouter.get("/em-breve/:slug", (req, res) => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  const recurso = RECURSOS[slug] ?? { titulo: "Em breve", icon: "🚧", descricao: "Este recurso está em desenvolvimento." };
  res.render("pages/em-breve", { title: recurso.titulo, recurso });
});
