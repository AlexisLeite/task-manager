import { expect } from "@playwright/test";
export async function chooseValue(page, combo, value) {
  const label = await combo.evaluate(
    (input, value) =>
      [
        ...input.closest(".searchable-select").querySelector("select").options,
      ].find((option) => option.value === value)?.text,
    value,
  );
  if (label === undefined) throw Error(`Opción inexistente: ${value}`);
  await combo.click();
  await combo.fill(label);
  await page.getByRole("option", { name: label, exact: true }).click();
}
export async function expectValue(combo, value) {
  await expect
    .poll(() =>
      combo.evaluate(
        (input) =>
          input.closest(".searchable-select").querySelector("select").value,
      ),
    )
    .toBe(value);
}
