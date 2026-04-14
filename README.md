# Store — Discord login, cart, checkout webhook, status page

Dark-themed store (BlackSwipe-style) with:
- **Discord login** required for products and checkout
- **Products page** (Spoofers & Valorant menus — add your products later)
- **Cart** and **Checkout** — on purchase, a Discord webhook is sent with buyer info and items
- **Status page** — public view of service status
- **Admin** — only Discord usernames `d.r.a.x.y` and `zs.jarko` can change status at `/admin.html`

## Setup

**→ See [SETUP.md](SETUP.md) for step-by-step instructions** (Discord OAuth2 redirect URL, webhook, logo, `.env`, and run commands).

## URLs

- `/` or `index.html` — Home
- `products.html` — Products (login required)
- `cart.html` — Cart (login required)
- `checkout.html` — Checkout (login required); sends Discord webhook on place order
- `status.html` — Public status
- `admin.html` — Admin-only status editor (d.r.a.x.y, zs.jarko)

## Adding products later

Edit `products.html`: add product cards with `id`, `name`, `price`, and an “Add to cart” button that calls `addToCart({ id, name, price, quantity: 1 })`. Cart and checkout already handle dynamic items and send them in the webhook.
