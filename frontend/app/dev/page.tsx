import DevDashboard from "@/components/dashboard/DevDashboard";
import AdminShell from "@/components/dashboard/admin/AdminShell";

export default function DeveloperDashboard() {
	return <AdminShell><DevDashboard /></AdminShell>;
}
