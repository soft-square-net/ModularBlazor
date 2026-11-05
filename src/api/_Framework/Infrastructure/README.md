## 2. The Role of Infrastructure (Adapters & Persistence)
- #### The Infrastructure library provides the technical plumbing and concrete implementations required to make the application run in the real world.

- #### Persistence: Entity Framework Core DbContext, database migrations, entity configurations (Fluent API), and concrete repository or data-access implementations.

- #### External Integrations: Implementations of email senders (SendGrid/SMTP), payment gateways (Stripe), file storage (AWS S3/Azure Blob), and third-party REST APIs.

- #### Cross-Cutting Concerns: Caching providers (Redis), logging adapters, and security/token generation services.

- #### Dependency Direction: Infrastructure references Core because it must implement the interfaces defined in Core.