import { Hono } from 'hono';
import { adms } from './adms/routes';

export const app = new Hono();

// CRITICAL: suppress the auto-generated `Date` HTTP header on every
// /iclock/* response. SpeedFace V5L (ZAM170-NF v1.3.11) firmware uses
// it as an authoritative time source — it syncs the device's internal
// clock to our response's Date, then re-renders the wall clock through
// the device's menu timezone. If the menu is on Dubai (+4) but reality
// is Kerala (+5:30), every punch resets the device clock by 1h 30m.
// Removing the header makes the device keep whatever the operator
// entered manually via the menu.
//
// Note: setting `c.res.headers.delete('Date')` doesn't work because
// Node's http.ServerResponse re-adds the Date header automatically
// unless `res.sendDate` is false on the per-response object. We grab
// the underlying ServerResponse from @hono/node-server's context env.
app.use('/iclock/*', async (c, next) => {
  const env = c.env as { outgoing?: { sendDate?: boolean } } | undefined;
  if (env?.outgoing) env.outgoing.sendDate = false;
  await next();
});

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }),
);

app.route('/iclock', adms);

app.notFound((c) => c.text('Not Found', 404));
app.onError((err, c) => {
  console.error(err);
  return c.text('Internal Error', 500);
});
