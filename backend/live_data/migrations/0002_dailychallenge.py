from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("live_data", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="DailyChallenge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("challenge_date", models.DateField(unique=True)),
                ("rounds", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-challenge_date"]},
        ),
    ]
