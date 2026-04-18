create extension if not exists vector;

alter table public.courses
add column if not exists embedding vector(384);

create index if not exists courses_embedding_ivfflat_idx
on public.courses using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.recommend_courses(
  query_embedding vector(384),
  match_count int default 5,
  exclude_course_ids uuid[] default null
)
returns table (
  id uuid,
  title text,
  price numeric,
  thumbnail_url text,
  category text,
  availability text
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    c.price,
    c.thumbnail_url,
    c.category,
    c.availability
  from public.courses c
  where c.status = 'active'
    and c.embedding is not null
    and (
      exclude_course_ids is null
      or not (c.id = any(exclude_course_ids))
    )
  order by c.embedding <-> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.popular_courses(
  match_count int default 5,
  exclude_course_ids uuid[] default null
)
returns table (
  id uuid,
  title text,
  price numeric,
  thumbnail_url text,
  category text,
  availability text
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    c.price,
    c.thumbnail_url,
    c.category,
    c.availability
  from public.courses c
  left join public.transactions t
    on t.course_id = c.id and t.status = 'completed'
  where c.status = 'active'
    and (
      exclude_course_ids is null
      or not (c.id = any(exclude_course_ids))
    )
  group by c.id
  order by count(t.id) desc, max(c.created_at) desc
  limit greatest(match_count, 1);
$$;
