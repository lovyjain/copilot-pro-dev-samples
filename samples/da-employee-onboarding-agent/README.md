# Employee Onboarding Buddy

## Summary

**Employee Onboarding Buddy** is a declarative agent for Microsoft 365 Copilot that automates the full employee onboarding and offboarding lifecycle using Microsoft Graph API. HR and IT administrators can onboard new hires — creating their Entra ID account, assigning Microsoft 365 licenses, adding them to department groups, generating a Planner task board for the manager, and sending a personalised welcome email — all within a single Copilot conversation.

Built with [TypeSpec for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents-typespec), using Entra ID OAuth for secure delegated access to Microsoft Graph.

![Employee Onboarding Buddy creating a new Microsoft 365 account](assets/onboarding-demo.png)

## Features

- **Create user accounts** — Provision a new Entra ID / Microsoft 365 user with a temporary password
- **Assign licenses** — Check available license inventory and assign the right Microsoft 365 plan
- **Manage group membership** — Add the new hire to their department group and Teams
- **Generate onboarding task boards** — Create a Planner plan with 5 standard onboarding tasks for the manager
- **Send welcome emails** — Draft and send a personalised welcome email to the new hire
- **Offboard employees** — Disable accounts, revoke licenses, and remove group memberships when employees leave

## Contributors

| Author | GitHub |
|--------|--------|
| Community Contribution | [copilot-pro-dev-samples](https://github.com/pnp/copilot-pro-dev-samples) |

## Version History

| Version | Date | Comments |
|---------|------|----------|
| 1.0 | June 4, 2026 | Initial release |

## Prerequisites

- **Microsoft 365 tenant** with [Microsoft 365 Copilot](https://www.microsoft.com/microsoft-365/copilot) enabled
- **Admin consent** required for `User.ReadWrite.All` and `Group.ReadWrite.All` — see [Graph Permissions](#graph-api-permissions) below
- **[Visual Studio Code](https://code.visualstudio.com/)** with the **[Microsoft 365 Agents Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension)** extension installed
- **[Node.js](https://nodejs.org/)** v20 or later

> **Important:** This agent uses delegated permissions that require the signed-in user to be a
> **Global Administrator** or **User Administrator** in the tenant. Standard users cannot create
> accounts or manage licenses without these elevated permissions.

## Minimal Path to Awesome

1. **Clone** this repository
   ```bash
   git clone https://github.com/pnp/copilot-pro-dev-samples.git
   ```

2. **Open the sample** in VS Code
   ```bash
   cd samples/da-employee-onboarding-agent
   code .
   ```

3. **Sign in** to your Microsoft 365 tenant via the M365 Agents Toolkit panel (the person icon in the sidebar)

4. **Provision** the agent:
   - Open the M365 Agents Toolkit sidebar
   - Click **Provision** under *Lifecycle*
   - This will: create an Entra App registration, compile the TypeSpec, register OAuth, and package the app

5. **Grant admin consent** for the required Graph permissions:
   - Navigate to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations**
   - Find **da-employee-onboarding-agent-aad** → **API permissions**
   - Click **Grant admin consent for [your tenant]**

   Or use this URL (replace `{tenantId}` and `{clientId}` with values from `env/.env.dev`):
   ```
   https://login.microsoftonline.com/{tenantId}/adminconsent?client_id={clientId}
   ```

6. **Preview** the agent:
   - In the M365 Agents Toolkit sidebar, click **Preview in Copilot (Edge)**
   - Select **Employee Onboarding Buddy** from the agent list

7. **Try a conversation starter:**
   - "I need to onboard a new employee joining our team"
   - "How many Microsoft 365 licenses do we have available?"

## Graph API Permissions

| Permission | Type | Why it's needed |
|---|---|---|
| `User.ReadWrite.All` | Delegated | Create, update, and disable user accounts |
| `Group.ReadWrite.All` | Delegated | Add and remove users from department groups |
| `Tasks.ReadWrite` | Delegated | Create Planner plans and onboarding task boards |
| `Mail.Send` | Delegated | Send welcome emails on behalf of the signed-in admin |

> All permissions require **admin consent** because `User.ReadWrite.All` and `Group.ReadWrite.All`
> are high-privilege scopes. Users will be prompted to consent on first use unless tenant-wide
> consent has already been granted.

## Example Conversations

**Onboarding a new hire:**
> *"Onboard Sarah Chen joining the Engineering team on July 15th as a Senior Software Engineer reporting to Alex Kumar"*

The agent will ask for any missing details, then:
1. Create Sarah's account at `sarah.chen@contoso.com`
2. Assign a Microsoft 365 E3 license
3. Add her to the Engineering group
4. Create a Planner onboarding board with 5 tasks for Alex
5. Send Sarah a welcome email

**Checking license inventory:**
> *"How many Microsoft 365 licenses do we have available?"*

**Offboarding:**
> *"Help me offboard John Smith who is leaving the company on Friday"*

## Known Limitations

- The agent uses **delegated permissions**, so the signed-in Microsoft 365 user must have admin rights to create users and manage licenses
- `CreatePlan` requires a **Group ID** as the `owner` — the agent will ask for or look up the department group ID
- Planner task buckets are not created automatically (tasks go to the default bucket); to add buckets, call `GetBuckets` after plan creation
- Emails are sent from the **signed-in admin's mailbox** via `Mail.Send` (delegated), not from a shared mailbox

## Help

We do not support samples, but this community is always willing to help, and we want to improve these samples. We use GitHub to track issues, which makes it easy for community members to volunteer their time and help resolve issues.

You can try looking at [issues related to this sample](https://github.com/pnp/copilot-pro-dev-samples/issues?q=label%3A%22sample%3A+da-employee-onboarding-agent%22) to see if anybody else is having the same issues.

If you encounter any issues using this sample, [create a new issue](https://github.com/pnp/copilot-pro-dev-samples/issues/new).

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**
