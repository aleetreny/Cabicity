import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.mapbox.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/styles/v1/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ features: [], routes: [] }),
    });
  });
});

test("every home service opens the trip search", async ({ page }) => {
  for (const service of ["cabify", "city", "moto", "voltio", "reservas"]) {
    await page.goto("./");
    await page.getByTestId(`service-${service}`).click();
    await expect(page).toHaveURL(/#\/buscar$/);
  }
});

test("completes the Cabify trip flow without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("./");
  await page.getByRole("button", { name: "Introduce tu ruta" }).click();
  await page.getByRole("button", { name: /Casa Calle de las Flores/i }).click();
  await expect(page).toHaveURL(/#\/resultados$/);
  await expect(page.getByText(/Próximos trenes/i).first()).toBeVisible();
  await expect(page.getByText(/CRTM GTFS programado/i).first()).toBeVisible();

  for (const label of ["Rápido", "Barato", "Ecológico", "Más seguro", "Equilibrado"]) {
    await page.getByRole("button", { name: new RegExp(label, "i") }).click();
  }

  await page.getByTestId("option-simple-cabify").click();
  await expect(page).toHaveURL(/#\/viaje$/);
  await page.getByRole("button", { name: "Comenzar viaje" }).click();
  await expect(page).toHaveURL(/#\/categoria-cabify$/);

  await page.getByRole("button", { name: /7892/ }).click();
  await page.getByTestId("category-electric").click();
  await page.getByRole("button", { name: "Programar" }).click();
  await page.getByRole("button", { name: "Pedir ahora" }).click();
  await expect(page).toHaveURL(/#\/recogida-cabify$/);

  await page.getByRole("button", { name: "Mensaje" }).click();
  await page.getByRole("button", { name: "Llamar" }).click();
  await page.getByRole("button", { name: /Compartir viaje/i }).click();
  await page.getByRole("button", { name: /Ver detalles del viaje/i }).click();
  await expect(page).toHaveURL(/#\/navegacion$/);

  await page.getByRole("button", { name: /Activar guía por voz/i }).click();
  await expect(page.getByRole("button", { name: /Silenciar guía por voz/i })).toBeVisible();
  expect(errors).toEqual([]);
});
