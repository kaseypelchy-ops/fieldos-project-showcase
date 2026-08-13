# Field Sales Operations Platform

A field-sales operations platform designed and developed to support door-to-door sales teams, territory management, scheduling, reporting, and operational oversight.

> Production source code is maintained privately because the application contains proprietary business logic and internal infrastructure.

## Overview

The platform was created to replace disconnected field-sales processes with a centralized system for representatives, vendors, operations, and management.

It provides address-level canvassing, territory assignments, disposition tracking, sales submissions, installation scheduling, operational reporting, invoicing workflows, and management analytics.

## Key Features

- Address-level canvassing and disposition tracking
- Interactive territory maps
- Sales submission and review workflows
- Installation scheduling and capacity management
- Representative and vendor management
- Historical activity tracking
- Management reporting and analytics
- Invoicing and install outcome workflows
- Automated customer communications
- Role-based administrative tools

## Technology

- TypeScript
- JavaScript
- PostgreSQL
- Supabase
- Vercel
- REST APIs
- SQL / PLpgSQL
- HTML / CSS

---

## Platform Showcase

The screenshots below highlight several parts of FieldOS, from the representative's field workflow to operations and executive reporting.

> Customer information and sensitive operational data have been removed or obscured for this public portfolio.

### Company Sales Dashboard

The Company Sales Dashboard provides a centralized view of field sales activity across teams, territories, and representatives.

Management can review sales performance, field activity, installation status, follow-up needs, and representative performance from a single interface.

**Highlights:**

- Sales and field activity tracking
- Territory and representative filtering
- Sales status monitoring
- Close-rate reporting
- Installation availability
- Recent activity and performance views
- Route and field activity review

![Company Sales Dashboard](images/01_company_sales_dashboard.png)

---

### Installation Schedule Availability

The scheduling interface provides visibility into installation capacity by territory, date, and appointment window.

Availability is reconciled against existing bookings and scheduled sales so representatives and operations teams can see which installation windows remain available.

**Highlights:**

- Territory-level installation capacity
- Appointment slot availability
- Booked vs. available capacity
- Multi-day scheduling
- Capacity utilization monitoring
- Overbooking prevention

![Installation Schedule Availability](images/02_install_schedule_availability.png)

---

### Sales Review & Invoicing

The Sales Review & Invoicing interface gives operations staff a dedicated workflow for managing submitted sales after the initial field sale.

Sales can move through installation, invoicing, cancellation, rescheduling, and clawback workflows without staff working directly with the underlying database.

**Highlights:**

- Centralized sales review queue
- Installation outcome tracking
- Invoice-ready sales identification
- Invoice export workflows
- Cancellation and reschedule tracking
- Clawback credit management
- Team and territory filtering

![Sales Review and Invoicing](images/03_sales_review_invoicing.png)

---

### Executive Command Center

The Executive Command Center provides leadership with a higher-level view of field-sales performance and operational health.

It combines sales, installations, field activity, capacity, follow-up opportunities, and team comparisons into a single management reporting interface.

**Highlights:**

- Executive KPI reporting
- Submitted vs. installed sales
- Field activity and close-rate analysis
- Team performance comparisons
- Installation capacity monitoring
- Follow-up opportunity identification
- Trend visualization
- Management summary reporting

![Executive Command Center](images/04_executive_command_center.png)

---

### Interactive Territory Map

Field representatives work from an interactive map containing serviceable addresses within their assigned territories.

Address-level markers allow representatives to see previous activity, current status, follow-up opportunities, and sales activity while working in the field.

**Highlights:**

- Address-level territory mapping
- Territory boundary visualization
- Address disposition tracking
- Previous field activity visibility
- Follow-up identification
- Sales and customer status indicators
- Territory-based representative access

![Interactive Territory Map](images/06_territory_map.png)

---

### Address & Sales Workflow

Representatives can open an address directly from the territory map and complete the sales workflow without leaving the field interface.

The system brings together customer information, available service packages, sales outcomes, and installation scheduling into a single workflow.

**Highlights:**

- Address-specific sales workflow
- Customer information capture
- Market-specific package availability
- Sales outcome tracking
- Installation appointment selection
- Real-time schedule availability
- Direct sales submission from the field

![Address and Sales Workflow](images/08_sales_form_example.png)

---

### Technical Documentation

For a deeper look at the system:

- **[System Architecture →](docs/architecture.md)**  
  Application architecture, data domains, user roles, integrations, security, and end-to-end system design.

- **[Technical Overview →](docs/technical-overview.md)**  
  Implementation details covering the technology stack, database design, scheduling concurrency, sales workflows, APIs, reporting, testing, deployment, and engineering decisions.

## My Role

I designed and developed the platform from the initial business requirements through production deployment.

My work included:

- Application and workflow design
- Database architecture
- Front-end and back-end development
- SQL and database functions
- API integrations
- Territory and mapping workflows
- Scheduling logic
- Reporting and analytics
- Automation
- Deployment
- Testing
- Ongoing feature development and production support

## Source Code

The production repository is private because it contains proprietary company workflows, operational logic, infrastructure configuration, and internal integrations.

This public repository is provided as a portfolio overview of the system, the problems it solves, and my work designing and developing it.
