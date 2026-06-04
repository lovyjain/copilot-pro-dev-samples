import "@typespec/http";
import "@typespec/openapi3";
import "@microsoft/typespec-m365-copilot";

using TypeSpec.Http;
using TypeSpec.M365.Copilot.Actions;

@service
@server(OnboardingAPI.SERVER_URL)
@actions(OnboardingAPI.ACTIONS_METADATA)
namespace OnboardingAPI {
  /**
   * Metadata for the Microsoft Graph Onboarding API actions.
   */
  const ACTIONS_METADATA = #{
    nameForHuman: "Employee Onboarding via Microsoft Graph API",
    descriptionForHuman: "Manage employee onboarding and offboarding workflows",
    descriptionForModel: "Manage the full employee onboarding and offboarding lifecycle using Microsoft Graph API, including creating user accounts, assigning licenses, managing group memberships, creating Planner task boards, and sending welcome emails.",
  };

  /**
   * The base URL for the Microsoft Graph API.
   */
  const SERVER_URL = "https://graph.microsoft.com/v1.0";

  /**
   * Create a new Microsoft 365 / Entra ID user account for a new employee.
   * @param user The user to create. Required fields: accountEnabled, displayName, mailNickname, userPrincipalName, passwordProfile.
   */
  @route("/users")
  @post op CreateUser(@body user: NewUser): string;

  /**
   * Get details of an existing user by their user ID or userPrincipalName.
   * @param userId The user ID or userPrincipalName.
   */
  @route("/users/{userId}")
  @get op GetUser(userId: string): string;

  /**
   * Update an existing user's profile properties such as job title, department, or office location.
   * @param userId The user ID or userPrincipalName.
   * @param user The properties to update.
   */
  @route("/users/{userId}")
  @patch op UpdateUser(userId: string, @body user: UserUpdate): string;

  /**
   * Disable a user account when offboarding an employee.
   * @param userId The user ID or userPrincipalName.
   */
  @route("/users/{userId}")
  @patch op DisableUser(userId: string, @body disableRequest: DisableUserRequest): string;

  /**
   * Assign a Microsoft 365 license to a user.
   * Call ListAvailableLicenses first to get the skuId values.
   * @param userId The user ID or userPrincipalName.
   * @param licenseRequest The license assignment request.
   */
  @route("/users/{userId}/assignLicense")
  @post op AssignLicense(userId: string, @body licenseRequest: LicenseRequest): string;

  /**
   * List all available Microsoft 365 license SKUs in the tenant and their available counts.
   */
  @route("/subscribedSkus")
  @get op ListAvailableLicenses(): string;

  /**
   * List groups in the tenant. Use $search or $filter to find groups by name.
   * @param filter OData filter expression (e.g., "displayName eq 'Engineering'")
   * @param search OData search expression (e.g., '"displayName:Engineering"')
   */
  @route("/groups")
  @get op ListGroups(
    @query `$filter`?: string,
    @query `$search`?: string,
    @query `$top`?: int32 = 20
  ): string;

  /**
   * Add a user to a group.
   * @param groupId The group ID.
   * @param memberRef The OData reference to the user. Set @odata.id to https://graph.microsoft.com/v1.0/users/{userId}
   */
  @route("/groups/{groupId}/members/$ref")
  @post op AddGroupMember(groupId: string, @body memberRef: MemberReference): string;

  /**
   * Remove a user from a group.
   * @param groupId The group ID.
   * @param userId The user ID to remove.
   */
  @route("/groups/{groupId}/members/{userId}/$ref")
  @delete op RemoveGroupMember(groupId: string, userId: string): string;

  /**
   * Create a new Planner plan (task board) for onboarding.
   * @param plan The plan to create. owner must be a Group ID (not a user ID).
   */
  @route("/planner/plans")
  @post op CreatePlan(@body plan: NewPlan): string;

  /**
   * Get all buckets (columns) in a Planner plan.
   * @param planId The Planner plan ID.
   */
  @route("/planner/plans/{planId}/buckets")
  @get op GetBuckets(planId: string): string;

  /**
   * Create a task in a Planner plan.
   * @param task The task to create. planId is required. bucketId is optional.
   */
  @route("/planner/tasks")
  @post op CreatePlannerTask(@body task: NewPlannerTask): string;

  /**
   * Send a welcome email to the new employee.
   * Always show the draft to the user and ask for confirmation before calling this.
   * @param message The email message to send.
   */
  @route("/me/sendMail")
  @post op SendWelcomeMail(@body message: SendMailRequest): string;

  // ── Models ─────────────────────────────────────────────────────────────────

  model NewUser {
    accountEnabled: boolean;
    displayName: string;
    mailNickname: string;
    userPrincipalName: string;
    passwordProfile: PasswordProfile;
    jobTitle?: string;
    department?: string;
    companyName?: string;
    officeLocation?: string;
    mobilePhone?: string;
    usageLocation?: string;
  }

  model PasswordProfile {
    forceChangePasswordNextSignIn: boolean;
    password: string;
  }

  model UserUpdate {
    jobTitle?: string;
    department?: string;
    officeLocation?: string;
    companyName?: string;
    mobilePhone?: string;
  }

  model DisableUserRequest {
    accountEnabled: boolean;
  }

  model LicenseRequest {
    addLicenses: LicenseToAssign[];
    removeLicenses: string[];
  }

  model LicenseToAssign {
    skuId: string;
  }

  model MemberReference {
    `@odata.id`: string;
  }

  model NewPlan {
    title: string;
    owner: string;
  }

  model NewPlannerTask {
    planId: string;
    bucketId?: string;
    title: string;
    dueDateTime?: string;
  }

  model SendMailRequest {
    message: Message;
    saveToSentItems?: boolean;
  }

  model Message {
    subject: string;
    body: ItemBody;
    toRecipients: Recipient[];
    ccRecipients?: Recipient[];
  }

  model ItemBody {
    contentType: "text" | "html";
    content: string;
  }

  model Recipient {
    emailAddress: EmailAddress;
  }

  model EmailAddress {
    address: string;
    name?: string;
  }

  model OnboardingAgentAuth is OAuth2Auth<[{
    type: OAuth2FlowType.authorizationCode;
    authorizationUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";
    tokenUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
    refreshUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
    scopes: ["User.ReadWrite.All", "Group.ReadWrite.All", "Tasks.ReadWrite", "Mail.Send"];
  }]> { }
}
