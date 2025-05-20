import { Autumn, fetchPricingTable } from 'autumn-js';
import { createMiddleware } from 'hono/factory';
import type { HonoContext } from '../ctx';
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';

const sanitizeCustomerBody = (body: any) => {
  let bodyCopy = { ...body };
  delete bodyCopy.id;
  delete bodyCopy.name;
  delete bodyCopy.email;
  return bodyCopy;
};

type AutumnContext = {
  Variables: {
    autumn: Autumn;
    customerData: {
      customerId: string;
      customerData: {
        name: string;
        email: string;
      };
    } | null;
  };
} & HonoContext;

const requireCustomer = createMiddleware<AutumnContext>(async (c, next) => {
  const { customerData } = c.var;
  if (!customerData) {
    return c.json({ error: 'No customer ID found' }, 401);
  }
  return next();
});

export const autumnApi = new Hono<AutumnContext>()
  .use('*', async (c, next) => {
    const autumn = new Autumn({
      secretKey: env.AUTUMN_SECRET_KEY,
    });
    c.set('autumn', autumn);
    const { session } = c.var;
    c.set(
      'customerData',
      !session
        ? null
        : {
            customerId: session.user.id,
            customerData: {
              name: session.user.name,
              email: session.user.email,
            },
          },
    );
    await next();
  })
  .post('/customers', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();

    return c.json(
      await autumn.customers
        .create({
          id: customerData!.customerId,
          ...customerData!.customerData,
          ...sanitizeCustomerBody(body),
        })
        .then((data) => data.data),
    );
  })
  .post('/attach', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);

    return c.json(
      await autumn
        .attach({
          ...sanitizedBody,
          customer_id: customerData!.customerId,
          customer_data: customerData!.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/cancel', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);

    return c.json(
      await autumn
        .cancel({
          ...sanitizedBody,
          customer_id: customerData!.customerId,
        })
        .then((data) => data.data),
    );
  })
  .post('/check', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);

    return c.json(
      await autumn
        .check({
          ...sanitizedBody,
          customer_id: customerData!.customerId,
          customer_data: customerData!.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/track', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();
    const sanitizedBody = sanitizeCustomerBody(body);

    return c.json(
      await autumn
        .track({
          ...sanitizedBody,
          customer_id: customerData!.customerId,
          customer_data: customerData!.customerData,
        })
        .then((data) => data.data),
    );
  })
  .post('/billing_portal', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();

    return c.json(
      await autumn.customers
        .billingPortal(customerData!.customerId, body)
        .then((data) => data.data),
    );
  })
  .get('/components/pricing_table', async (c) => {
    const { autumn, customerData } = c.var;

    return c.json(
      await fetchPricingTable({
        instance: autumn,
        params: {
          customer_id: customerData?.customerId || undefined,
        },
      }),
    );
  })
  .post('/entities', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const body = await c.req.json();

    return c.json(
      await autumn.entities.create(customerData!.customerId, body).then((data) => data.data),
    );
  })
  .get('/entities/:entityId', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const entityId = c.req.param('entityId');
    const expand = c.req.query('expand')?.split(',') as 'invoices'[] | undefined;

    if (!entityId) {
      return c.json(
        {
          error: 'no_entity_id',
          message: 'Entity ID is required',
        },
        400,
      );
    }

    return c.json(
      await autumn.entities
        .get(customerData!.customerId, entityId, {
          expand,
        })
        .then((data) => data.data),
    );
  })
  .delete('/entities/:entityId', requireCustomer, async (c) => {
    const { autumn, customerData } = c.var;
    const entityId = c.req.param('entityId');

    if (!entityId) {
      return c.json(
        {
          error: 'no_entity_id',
          message: 'Entity ID is required',
        },
        400,
      );
    }

    return c.json(
      await autumn.entities.delete(customerData!.customerId, entityId).then((data) => data.data),
    );
  });
