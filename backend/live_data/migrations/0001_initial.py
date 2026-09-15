import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="LeaderboardEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=20)),
                ("streak", models.PositiveSmallIntegerField()),
                ("rank_title", models.CharField(default="Ocean Navigator", max_length=60)),
                ("accuracy", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={"ordering": ["-streak", "-created_at"]},
        ),
    ]
