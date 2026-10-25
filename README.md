# Đề tài 38: Hệ thống Quản lý Chi tiêu

Ứng dụng theo dõi chi tiêu cá nhân/gia đình, triển khai bằng Docker Compose. Stack gồm frontend Nginx, API Node.js/Express, PostgreSQL, pgAdmin, Prometheus, cAdvisor, Grafana, Loki và Promtail.

## Yêu cầu

- Docker Engine và Docker Compose plugin
- Git
- Mở các cổng cần thiết trong môi trường demo: 80, 3000, 5050, 9090, 3100

## Cài đặt và chạy

```sh
git clone https://github.com/dtc245200225-crypto/de-38.git
cd de-38
cp .env.example .env
```

Sửa bốn giá trị trong `.env` thành các mật khẩu dài, riêng biệt và không dùng lại mật khẩu cá nhân. Tệp `.env` đã được loại khỏi Git. Sau đó chạy:

```sh
docker compose config
docker compose up -d --build
docker compose ps
```

Chờ các dịch vụ khởi động, sau đó mở website ở cổng 80. Cấu hình mẫu dùng cổng 80 cho Nginx, 5050 cho pgAdmin, 9090 cho Prometheus và 3000 cho Grafana. Loki nhận truy vấn nội bộ qua Grafana; cổng 3100 chỉ nên mở khi cần kiểm tra/demo.

## Thành phần

| Thành phần | Vai trò | Mạng |
|---|---|---|
| Nginx | Reverse proxy, security headers, access log JSON | frontend, monitoring |
| Frontend | Giao diện quản lý khoản chi | frontend |
| Backend | API, kiểm tra đầu vào, metrics Prometheus | frontend gián tiếp qua Nginx, backend, monitoring |
| PostgreSQL | Lưu khoản chi | backend nội bộ |
| pgAdmin | Quản trị PostgreSQL | frontend, backend |
| Prometheus | Thu thập metrics backend, cAdvisor, PostgreSQL exporter | monitoring |
| Grafana | Dashboard metrics và truy vấn log | monitoring |
| Loki + Promtail | Nhận và lưu log Nginx | monitoring |

PostgreSQL chỉ tham gia mạng `backend_net` nội bộ. Không công khai cổng database. PostgreSQL exporter dùng tài khoản riêng `postgres_exporter` có quyền `pg_monitor`, được tạo trong lần khởi tạo volume mới. Promtail chỉ đọc thư mục log Nginx và không cần quyền truy cập Docker socket.

## Truy cập và đăng nhập

- Website: `http://<server-ip>/`
- pgAdmin: `http://<server-ip>:5050/` — email `admin@domain.com`, mật khẩu lấy từ `PGADMIN_DEFAULT_PASSWORD` trong `.env`
- Prometheus: `http://<server-ip>:9090/`
- Grafana: `http://<server-ip>:3000/` — tài khoản `admin`, mật khẩu lấy từ `GRAFANA_ADMIN_PASSWORD` trong `.env`
- Loki API: `http://<server-ip>:3100/` (chỉ mở cổng này trong mạng demo cần thiết)

Không đưa `.env` hoặc mật khẩu thật vào commit. Nếu các mật khẩu cũ đã từng được commit hoặc dùng trên máy chủ, hãy thay chúng và cập nhật đồng thời thông tin xác thực trong môi trường triển khai.

### Cập nhật volume PostgreSQL đã tồn tại

Script tạo `postgres_exporter` chỉ chạy khi volume `pgdata` được khởi tạo lần đầu. Với volume cũ, sau khi cập nhật `.env`, đăng nhập PostgreSQL bằng tài khoản quản trị và chạy một lần:

```sql
CREATE ROLE postgres_exporter LOGIN PASSWORD 'thay-bang-POSTGRES_EXPORTER_PASSWORD';
GRANT CONNECT ON DATABASE expense_db TO postgres_exporter;
GRANT pg_monitor TO postgres_exporter;
```

Sau đó khởi động lại exporter: `docker compose up -d postgres-exporter prometheus`.

## Dữ liệu mẫu, lưu trữ và sao lưu

Tệp `postgres/seed/demo-expenses.sql` chứa hai khoản chi **minh họa** để trình diễn giao diện. Nạp dữ liệu sau khi ứng dụng đã khởi tạo bảng `expenses`:

```sh
docker compose exec -T postgres psql -U expense_user -d expense_db < postgres/seed/demo-expenses.sql
```

Trên PowerShell, có thể nạp tệp bằng pipeline:

```powershell
Get-Content -Raw .\postgres\seed\demo-expenses.sql | docker compose exec -T postgres psql -U expense_user -d expense_db
```

Dữ liệu vận hành được lưu trong named volume `pgdata`. Lệnh `docker compose down` giữ nguyên volume; `docker compose down -v` xóa cả dữ liệu database và Grafana. Không đưa database dump hoặc dữ liệu chi tiêu thật lên GitHub. Thư mục `backups/` đã được loại khỏi Git.

### Sao lưu PostgreSQL

Chạy trong Bash, Git Bash hoặc WSL để tạo bản sao lưu SQL:

```sh
mkdir -p backups
docker compose exec -T postgres pg_dump -U expense_user -d expense_db > backups/expense_db.sql
```

### Khôi phục PostgreSQL

Lệnh dưới đây thay thế bảng chi tiêu hiện tại bằng dữ liệu trong bản sao lưu. Tạo bản sao lưu trước khi khôi phục:

```sh
docker compose stop backend
docker compose exec -T postgres psql -U expense_user -d expense_db -c 'DROP TABLE IF EXISTS public.expenses CASCADE'
docker compose exec -T postgres psql -U expense_user -d expense_db < backups/expense_db.sql
docker compose start backend
```

Tệp demo có thể đưa lên GitHub; bản sao lưu tạo từ database thật thì không.

## Kiểm tra chức năng

- Thêm, xem và xóa khoản chi trên giao diện.
- API: `GET /api/expenses`, `POST /api/expenses`, `DELETE /api/expenses/:id`.
- Health check API: `GET /healthz`; metrics ứng dụng: `GET /metrics` (chỉ dành cho mạng giám sát).
- Prometheus: truy vấn `up`, `http_request_duration_seconds_count`, `pg_up` và `container_memory_usage_bytes`.
- Grafana: dashboard `Expense Tracker Operations` được cấp tự động từ `grafana/dashboards/`.
- Loki/LogQL: `{job="nginx"}`, `{job="nginx"} |= "/api/expenses"`, `{job="nginx"} | json | status="404"`.

Nếu một target Prometheus không ở trạng thái `UP`, kiểm tra `docker compose ps`, `docker compose logs prometheus backend cadvisor postgres-exporter` và tên dịch vụ trong `prometheus/prometheus.yml`.

## Dừng và gỡ

```sh
docker compose down
```

Lệnh trên giữ dữ liệu PostgreSQL và Grafana trong named volumes. Muốn xóa dữ liệu demo, dùng `docker compose down -v` sau khi đã sao lưu; thao tác này xóa dữ liệu trong các volumes.

## Cấu trúc thư mục

```text
backend/                 API Node.js và Dockerfile
frontend/                HTML, CSS, JavaScript và Dockerfile
nginx/                   Reverse proxy, access log và security headers
prometheus/               Cấu hình scrape targets
grafana/                  Datasource provisioning và dashboard JSON
promtail/                 Cấu hình đọc log Nginx
docker-compose.yml        Mạng và dịch vụ triển khai
.env.example              Mẫu biến môi trường, không chứa mật khẩu triển khai
```
