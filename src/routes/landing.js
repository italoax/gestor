import { Router } from 'express';
export const landingRouter = Router();
landingRouter.get('/ix-streaming', (_req, res) => {
  res.redirect(301, '/');
});
landingRouter.get('/', (_req, res) => {
  const phone = (process.env.IX_STREAMING_WHATSAPP ?? '5531982453768').replace(
    /\D/g,
    '',
  );
  const contact = /^\d{10,15}$/.test(phone) ? phone : '';
  const contactUrl = (price) =>
    contact
      ? `https://wa.me/${contact}?text=${encodeURIComponent(
          price
            ? `Olá! Quero conhecer o plano de R$ ${price}/mês da ixstreaming.`
            : 'Olá! Quero conhecer os planos da ixstreaming.',
        )}`
      : '#contato';
  res.render('pages/ix-streaming', {
    layout: false,
    contactReady: Boolean(contact),
    contactUrl,
  });
});
