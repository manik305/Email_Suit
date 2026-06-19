# Azure Portal Step-by-Step Deployment Guide for Email Suit

This document outlines the step-by-step process to deploy the separate **React Frontend** and **FastAPI Backend** containers to Azure using the **Azure Portal (Web Console)** interface.

---

## Architecture Overview

```mermaid
graph TD
    User([User Browser]) -->|HTTPS| FE[Azure Web App for Containers - Frontend]
    FE -->|API Requests| BE[Azure Web App for Containers - Backend]
    BE -->|Database Queries| DB[(Supabase PostgreSQL)]
    GitHub[GitHub Repository] -->|Actions Workflow| ACR{Azure Container Registry}
    ACR -->|Pulls Image| FE
    ACR -->|Pulls Image| BE
```

- **Frontend**: Served via Nginx inside a Docker container, running on Azure App Service (Web App for Containers).
- **Backend**: FastAPI app running on Azure App Service (Web App for Containers) on port 8000.
- **Database**: PostgreSQL hosted on Supabase (already configured).
- **CI/CD**: GitHub Actions building Docker images on push to the `main` branch, pushing them to Azure Container Registry (ACR), and triggering web app restarts.

---

## Step 1: Create Azure Resources in Azure Portal

Log in to the [Azure Portal](https://portal.azure.com/).

### 1. Create a Resource Group
1. Search for **Resource groups** in the top search bar and click on it.
2. Click **+ Create**.
3. Under **Resource group**, type `EmailSuit-RG`.
4. Select your preferred region (e.g., `East US`).
5. Click **Review + create**, then click **Create**.

### 2. Create Azure Container Registry (ACR)
1. Search for **Container registries** in the top search bar and click on it.
2. Click **+ Create**.
3. Fill in the **Basics** tab:
   - **Subscription**: Select your Azure subscription.
   - **Resource group**: Select `EmailSuit-RG`.
   - **Registry name**: Type `emailsasregistry` (must be globally unique, lowercase, letters/numbers only).
   - **Location**: Match your resource group location (e.g., `East US`).
   - **SKU**: Select `Basic` (perfect for testing and cost-saving).
4. Click **Review + create**, then click **Create**.
5. Once deployment is complete, go to your new ACR resource.
6. Under **Settings** in the left sidebar, click **Access keys**.
7. Enable the **Admin user** toggle. Copy and save the **Login server**, **Username**, and the **password** values for later use.

### 3. Create Web App for the Backend
1. Search for **App Services** in the top search bar and click on it.
2. Click **+ Create** -> Select **Web App**.
3. Fill in the **Basics** tab:
   - **Subscription**: Select your subscription.
   - **Resource group**: Select `EmailSuit-RG`.
   - **Name**: Type `emailsas-backend-app` (must be globally unique).
   - **Publish**: Select **Docker Container**.
   - **Operating System**: Select **Linux**.
   - **Region**: Match your Resource Group (e.g., `East US`).
   - **Linux Plan**: Under **App Service Plan**, click **Create new** and name it `EmailSuit-Plan`.
   - **Pricing Plan**: Choose `Basic B1` (or `Free F1` if available under your subscription).
4. Click **Next: Docker >** at the bottom:
   - **Options**: Select **Single Container**.
   - **Image Source**: Select **Azure Container Registry**.
   - **Registry**: Select `emailsasregistry`.
   - **Image**: Choose `emailsas-backend`.
   - **Tag**: Select `latest` (or any dummy image like `nginx` to start, as GitHub Actions will overwrite it on first build).
5. Click **Review + create**, then click **Create**.

### 4. Create Web App for the Frontend
Follow the exact same steps to create the frontend Web App:
1. Go back to **App Services**, click **+ Create** -> **Web App**.
2. Fill in the **Basics** tab:
   - **Subscription**: Select your subscription.
   - **Resource group**: Select `EmailSuit-RG`.
   - **Name**: Type `emailsas-frontend-app` (globally unique).
   - **Publish**: Select **Docker Container**.
   - **Operating System**: Select **Linux**.
   - **Region**: Match your Resource Group (e.g., `East US`).
   - **App Service Plan**: Select the existing `EmailSuit-Plan` created in the previous step.
3. Click **Next: Docker >**:
   - **Options**: Select **Single Container**.
   - **Image Source**: Select **Azure Container Registry**.
   - **Registry**: Select `emailsasregistry`.
   - **Image**: Choose `emailsas-frontend`.
   - **Tag**: Select `latest`.
4. Click **Review + create**, then click **Create**.

---

## Step 2: Configure App Settings and Environment Variables

You need to tell Azure Web Apps what ports to listen on and provide database secrets to the backend.

### 1. Configure the Backend Web App
1. Go to **App Services** and click on your backend app (`emailsas-backend-app`).
2. Under **Settings** in the left sidebar, click on **Configuration** (or **Environment variables** depending on your portal layout).
3. Under **Application settings**, click **+ New application setting** to add the following keys:
   - **Name**: `WEBSITES_PORT`
     - **Value**: `8000` (Forces Azure to route web requests to FastAPI's port 8000)
   - **Name**: `DATABASE_URL`
     - **Value**: `postgresql://postgres.rkfwraxddyozjcgssjii:Dandothkar1998@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`
   - **Name**: `SECRET_KEY`
     - **Value**: `sb_secret_K6EE_4MGbb_P31K26IAVlQ_h0xJMdrW`
   - **Name**: `ALGORITHM`
     - **Value**: `HS256`
4. Click **Save** at the top of the Configuration panel to apply the changes.

### 2. Configure the Frontend Web App
1. Go to your frontend app (`emailsas-frontend-app`).
2. Go to **Settings** -> **Configuration** (or **Environment variables**).
3. Under **Application settings**, click **+ New application setting**:
   - **Name**: `WEBSITES_PORT`
     - **Value**: `80` (Directs Azure to Nginx's port 80)
4. Click **Save**.

---

## Step 3: Create Azure Service Principal for GitHub Actions

To allow GitHub Actions to push images and update the Web Apps, register a Service Principal credentials token:

1. Search for **Microsoft Entra ID** (formerly Azure Active Directory) in the search bar and select it.
2. Under **Manage** in the sidebar, click **App registrations**.
3. Click **+ New registration**:
   - **Name**: Type `EmailSuit-Deployer`.
   - **Supported account types**: Select the first option (*Accounts in this organizational directory only*).
   - Click **Register**.
4. Copy and save the following values from the **Overview** screen:
   - **Application (client) ID**
   - **Directory (tenant) ID**
5. In the left sidebar under the app registration, click **Certificates & secrets**.
6. Click **+ New client secret**:
   - **Description**: Type `GitHub Actions Deploy Token`.
   - **Expires**: Select `Recommended (180 days)`.
   - Click **Add**.
7. Copy the secret **Value** immediately (this value is hidden once you navigate away).
8. Grant permission to the Resource Group:
   - Search for **Resource groups** in the top search bar and click on `EmailSuit-RG`.
   - Click on **Access control (IAM)** in the sidebar.
   - Click **+ Add** -> Select **Add role assignment**.
   - **Role**: Select `Contributor`. Click Next.
   - **Assign access to**: Select `User, group, or service principal`.
   - **Members**: Click **+ Select members**, search for `EmailSuit-Deployer`, select it, and click **Select**.
   - Click **Review + assign**, then click **Review + assign** again.

---

## Step 4: Configure GitHub Actions Secrets

1. Find your Azure **Subscription ID**:
   - Search for **Subscriptions** in the top search bar and click on it.
   - Copy the **Subscription ID** corresponding to your active billing subscription.
2. Go to your **GitHub repository** webpage.
3. Click on **Settings** -> **Secrets and variables** -> **Actions**.
4. Click **New repository secret**.
5. Name the secret `AZURE_CREDENTIALS` and paste the following JSON payload, substituting your saved credentials:
   ```json
   {
     "clientId": "<YOUR_CLIENT_ID>",
     "clientSecret": "<YOUR_SECRET_VALUE>",
     "subscriptionId": "<YOUR_SUBSCRIPTION_ID>",
     "tenantId": "<YOUR_TENANT_ID>"
   }
   ```
6. Click **Add secret**.

---

## Step 5: Push to Main to Trigger Deploy

Commit your code changes and push them to your repository's `main` branch. GitHub Actions will pick up the push, build both Dockerfiles, push them to ACR, and redeploy them to your Azure App Services.
