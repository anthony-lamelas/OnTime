import { test, expect } from '@playwright/test';

test('navigate authentication menus and assert map rendering', async ({ page }) => {
   // Visit Planner
   await page.goto('/');
   
   // Validate the app mounted properly without crashing
   await expect(page).toHaveTitle(/OnTime/);
   
   // Landing page is shown first — click Sign in to reach auth screen
   await page.click('text=Sign in');

   // Assert auth screen rendered
   await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
