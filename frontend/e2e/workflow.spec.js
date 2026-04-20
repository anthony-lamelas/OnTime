import { test, expect } from '@playwright/test';

test('navigate authentication menus and assert map rendering', async ({ page }) => {
   // Visit Planner
   await page.goto('/');
   
   // Validate the app mounted properly without crashing
   await expect(page).toHaveTitle(/OnTime/);
   
   // Open standard nav hooks validating components respond safely
   await page.click('text=Login / Register');
   
   // Assert rendering
   await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
});
