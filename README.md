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

Tài khoản demo theo yêu cầu của đề tài là `admin` với mật khẩu `123456`. Mẫu `.env.example` đã đặt sẵn các giá trị này; có thể giữ nguyên `.env` để chạy demo. Đây là mật khẩu yếu, chỉ dùng cho môi trường học tập cô lập và không dùng lại trên dịch vụ công khai hoặc tài khoản cá nhân. Tệp `.env` đã được loại khỏi Git. Sau đó chạy:

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

## Đường dẫn truy cập và tài khoản

Địa chỉ demo hiện dùng là `192.168.105.128`. Mở các đường dẫn sau trên máy cùng mạng; nếu chạy trên máy khác, thay địa chỉ IP này bằng IP máy chủ Docker.

| Trang/chức năng | Đường dẫn trực tiếp | Tài khoản |
|---|---|---|
| Website Expense Tracker | http://192.168.105.128/ | Không có màn hình đăng nhập |
| API danh sách khoản chi | http://192.168.105.128/api/expenses | Không cần đăng nhập |
| Kiểm tra API | http://192.168.105.128/healthz | Không cần đăng nhập |
| pgAdmin | http://192.168.105.128:5050/ | `admin@domain.com` / `123456` |
| Prometheus | http://192.168.105.128:9090/ | Không cần đăng nhập |
| Prometheus targets | http://192.168.105.128:9090/targets | Không cần đăng nhập |
| Grafana | http://192.168.105.128:3000/ | `admin` / `123456` |
| Dashboard Expense Tracker | http://192.168.105.128:3000/d/expense-tracker/expense-tracker | Đăng nhập Grafana bằng `admin` / `123456` |
| Loki readiness | http://192.168.105.128:3100/ready | Endpoint kiểm tra; truy vấn log trong Grafana Explore |

Tài khoản PostgreSQL để kết nối từ pgAdmin là `admin` / `123456`, database `expense_db`, hostname `postgres`, cổng `5432` (chỉ truy cập được từ mạng Docker). pgAdmin yêu cầu địa chỉ email cho tài khoản quản trị nên tên đăng nhập giao diện của pgAdmin là `admin@domain.com`; mật khẩu vẫn là `123456`. Prometheus, Loki, API và website demo hiện không có đăng nhập. cAdvisor không mở cổng ra máy chủ; xem metrics qua Prometheus/Grafana.

Các dịch vụ Grafana và pgAdmin khởi tạo mật khẩu từ biến môi trường lúc khởi tạo ban đầu. Grafana có volume lưu dữ liệu; nếu volume Grafana đã tồn tại với mật khẩu cũ, đổi `GF_SECURITY_ADMIN_PASSWORD` trong Compose chưa đủ. Đặt lại bằng lệnh sau rồi đăng nhập bằng `admin` / `123456`:

```sh
docker compose exec grafana grafana-cli admin reset-admin-password 123456
```

Mật khẩu `123456` được yêu cầu cho bản demo và không đạt tiêu chí mật khẩu mạnh trong yêu cầu hardening. Không đưa stack này ra Internet với mật khẩu đó; giới hạn các cổng demo bằng firewall.

### Cập nhật volume PostgreSQL đã tồn tại

`POSTGRES_USER` và `POSTGRES_PASSWORD` chỉ được áp dụng khi volume `pgdata` được khởi tạo lần đầu. Với volume cũ từ cấu hình `expense_user`, backend cần tài khoản `admin` mới. Dừng backend rồi mở psql bằng role quản trị cũ (mặc định trước đây là `expense_user`):

```sh
docker compose stop backend
docker compose exec postgres psql -U expense_user -d postgres
```

Tại dấu nhắc psql, chạy các câu lệnh sau một lần:

```sql
CREATE ROLE admin LOGIN PASSWORD '123456';
GRANT CONNECT ON DATABASE expense_db TO admin;
\c expense_db
GRANT USAGE, CREATE ON SCHEMA public TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO admin;
CREATE ROLE postgres_exporter LOGIN PASSWORD '123456';
GRANT CONNECT ON DATABASE expense_db TO postgres_exporter;
GRANT pg_monitor TO postgres_exporter;
```

Sau đó thoát psql bằng `\q` và cập nhật toàn bộ stack cùng mật khẩu Grafana:

```sh
docker compose up -d --build
docker compose exec grafana grafana-cli admin reset-admin-password 123456
```

Nếu role `admin` hoặc `postgres_exporter` đã tồn tại, dùng `ALTER ROLE <ten_role> WITH PASSWORD '123456';` thay cho câu lệnh `CREATE ROLE` tương ứng.

## Dữ liệu mẫu, lưu trữ và sao lưu

Tệp `postgres/seed/demo-expenses.sql` chứa hai khoản chi **minh họa** để trình diễn giao diện. Nạp dữ liệu sau khi ứng dụng đã khởi tạo bảng `expenses`:

```sh
docker compose exec -T postgres psql -U admin -d expense_db < postgres/seed/demo-expenses.sql
```

Trên PowerShell, có thể nạp tệp bằng pipeline:

```powershell
Get-Content -Raw .\postgres\seed\demo-expenses.sql | docker compose exec -T postgres psql -U admin -d expense_db
```

Dữ liệu vận hành được lưu trong named volume `pgdata`. Lệnh `docker compose down` giữ nguyên volume; `docker compose down -v` xóa cả dữ liệu database và Grafana. Không đưa database dump hoặc dữ liệu chi tiêu thật lên GitHub. Thư mục `backups/` đã được loại khỏi Git.

### Sao lưu PostgreSQL

Chạy trong Bash, Git Bash hoặc WSL để tạo bản sao lưu SQL:

```sh
mkdir -p backups
docker compose exec -T postgres pg_dump -U admin -d expense_db > backups/expense_db.sql
```

### Khôi phục PostgreSQL

Lệnh dưới đây thay thế bảng chi tiêu hiện tại bằng dữ liệu trong bản sao lưu. Tạo bản sao lưu trước khi khôi phục:

```sh
docker compose stop backend
docker compose exec -T postgres psql -U admin -d expense_db -c 'DROP TABLE IF EXISTS public.expenses CASCADE'
docker compose exec -T postgres psql -U admin -d expense_db < backups/expense_db.sql
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
