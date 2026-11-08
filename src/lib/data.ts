import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function run<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const accountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: () => run(supabase.from("accounts").select("*").order("name")),
});

export const transactionsQuery = queryOptions({
  queryKey: ["transactions"],
  queryFn: () =>
    run(
      supabase
        .from("transactions")
        .select("*, accounts(name), clients(name), suppliers(name)")
        .order("occurred_at", { ascending: false }),
    ),
});

export const clientsQuery = queryOptions({
  queryKey: ["clients"],
  queryFn: () => run(supabase.from("clients").select("*").order("name")),
});

export const clientQuery = (id: string) =>
  queryOptions({
    queryKey: ["clients", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*, client_contacts(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

export const employeesQuery = queryOptions({
  queryKey: ["employees"],
  queryFn: () => run(supabase.from("employees").select("*").order("full_name")),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () => run(supabase.from("suppliers").select("*").order("name")),
});

export const paymentsQuery = queryOptions({
  queryKey: ["payments"],
  queryFn: () =>
    run(supabase.from("payments").select("*, suppliers(name)").order("created_at", { ascending: false })),
});
